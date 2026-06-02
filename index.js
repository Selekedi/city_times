const {onRequest} = require("firebase-functions/v2/https");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");
const axios = require("axios");
const crypto = require("crypto");
const cors = require("cors");
const dns = require("dns");

admin.initializeApp(
    {credential: admin.credential.applicationDefault()},
);

const allowedOrigins = ["https://selekedi.github.io",
  "https://thatothemc.github.io", "http://127.0.0.1:5500",
  "http://localhost:5500"];

const corsOptions = cors({
  origin: (origin, callback) => {
    // Check if origin is in the allowed list or not
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
});


const db = getFirestore();

/**
 * Converts a string or number to a rounded integer
 * and formats it with two decimal points ending in ".00".
 * @param {string|number} input - The value to be converted and rounded.
 * @return {string} - The formatted payment-friendly value (e.g., "123.00"),
 * or "NaN" if the input is invalid.
 */
function formatPaymentValue(input) {
  // Convert the input to a number
  const number = parseFloat(input);

  // Check if the input is a valid number
  if (isNaN(number)) {
    return "NaN"; // Return "NaN" for invalid input
  }

  // Round to the nearest integer and append ".00"
  const rounded = Math.round(number);
  return `${rounded}.00`;
}

exports.checkBookingFeasibility = onRequest(async (req, res) => {
  req, res, async () => {
    try {
      // Ensure the request method is POST
      if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
      }

      // Extract new booking data from the request body
      const newBooking = req.body;

      if (!newBooking || !newBooking.startTimestamp ||
        !newBooking.endTimestamp || !newBooking.location) {
        return res.status(400).send("Invalid booking data.");
      }

      // Call the checkFeasibility function
      const isFeasible = await checkFeasibility(newBooking);

      // Return the feasibility result
      return res.status(200).json({feasible: isFeasible});
    } catch (error) {
      console.error("Error checking booking feasibility:", error);
      return res.status(500).send("Internal Server Error");
    }
  };
});


/**
 * Checks the feasibility of a new booking by ensuring that there are no direct
 * overlaps with existing bookings and that the travel time between nearby
 * bookings is manageable within a 5-hour window.
 *
 * @async
 * @function checkFeasibility
 * @param {Object} nBook - The new booking to check.
 * @param {number} nBook.startTimestamp - The start time of the new booking
 *     in milliseconds.
 * @param {number} nBook.endTimestamp - The end time of the new booking
 *     in milliseconds.
 * @param {Object} nBook.location - The location of the new booking.
 * @param {number} nBook.location.latitude - Latitude of the booking location.
 * @param {number} nBook.location.longitude - Longitude of the booking location.
 * @return {Promise<boolean>} - Returns `true` if the booking is feasible,
 *     otherwise `false`.
 */
async function checkFeasibility(nBook) {
  const bookingsRef = db.collection("bookings");
  const isNoOverlap = await checkDirectOverlap(nBook);
  if (!isNoOverlap) {
    return false; // Exit early if there's a direct overlap
  }

  // Query for bookings within 5-hour window, only confirmed ones
  const fiveHoursInMillis = 5 * 60 * 60 * 1000;
  const startWindow = nBook.startTimestamp - fiveHoursInMillis;
  const endWindow = nBook.endTimestamp + fiveHoursInMillis;

  const querySnapshot = await bookingsRef
      .where("confirmed", "==", true)
      .where("startTimestamp", ">=", startWindow)
      .where("endTimestamp", "<=", endWindow)
      .get();

  if (querySnapshot.empty) {
    console.log("No nearby bookings to check.");
    return true; // No nearby bookings to check, booking is feasible
  }

  // Step 1: Extract locations for travel time check
  const ogLocs = querySnapshot.docs.map((booking) => {
    const location = booking.data().location;
    return `${location.latitude},${location.longitude}`;
  });

  // Step 2: Calculate travel times in a batch
  const travelTimes = await calculateBatchTravelTimes(ogLocs, nBook.location);

  // Step 3: Check travel feasibility
  let isFeasible = true;
  querySnapshot.docs.forEach((booking, index) => {
    const travelDuration = travelTimes[index].elements[0].duration.value;
    const travelTimeInHours = travelDuration / 3600; // Convert to hours

    const existingBooking = booking.data();
    const existingEnd = existingBooking.endTimestamp;
    const newStart = nBook.startTimestamp;

    const newEnd = nBook.endTimestamp;
    const existingStart = existingBooking.startTimestamp;

    // Check preceding bookings (ones that end before the new booking starts)
    if (existingEnd <= newStart) {
      const timeGap = (newStart - existingEnd) / (60 * 60 * 1000);
      if (timeGap < travelTimeInHours) {
        console.log("booking not feasible");
        isFeasible = false;
      }
    }

    // Check following bookings (ones that start after the new booking ends)
    if (existingStart >= newEnd) {
      const timeGap = (existingStart - newEnd) / (60 * 60 * 1000);
      if (timeGap < travelTimeInHours) {
        console.log("booking not feasible");
        isFeasible = false;
      }
    }
  });

  if (isFeasible) {
    console.log("Booking is feasible.");
  } else {
    console.log("Booking is NOT feasible due to travel time constraints.");
  }

  return isFeasible;
}

/**
 * Checks for direct overlap between the new booking and existing confirmed
 * bookings. A booking overlaps if it starts before the new booking ends
 * and ends after the new booking starts.
 *
 * @async
 * @function checkDirectOverlap
 * @param {Object} newBooking - The new booking to check.
 * @param {number} newBooking.startTimestamp - The start time of the new booking
 *     in milliseconds.
 * @param {number} newBooking.endTimestamp - The end time of the new booking
 *     in milliseconds.
 * @return {Promise<boolean>} - Returns `true` if no overlap is found,
 *     otherwise `false`.
 */
async function checkDirectOverlap(newBooking) {
  const bookingsRef = db.collection("bookings");

  // Query for confirmed bookings that overlap
  const querySnapshot = await bookingsRef
      .where("confirmed", "==", true)
      .where("startTimestamp", "<", newBooking.endTimestamp)
      .where("endTimestamp", ">", newBooking.startTimestamp)
      .get();

  if (!querySnapshot.empty) {
    console.log("Direct overlap detected. Booking is not feasible.");
    return false; // Exit if overlap is found
  }

  return true; // No overlap, continue feasibility check
}

/**
 * Calculates the travel times between multiple origin locations and a single
 * destination. Uses the Google Distance Matrix API to fetch travel times
 * in a batch.
 *
 * @async
 * @function calculateBatchTravelTimes
 * @param {Array<string>} origins - An array of origin coordinates in the format
 *     "latitude,longitude".
 * @param {Object} destination - The destination location.
 * @param {number} destination.lat - Latitude of the destination.
 * @param {number} destination.lng - Longitude of the destination.
 * @return {Promise<Array>} - Returns a promise that resolves to an array of
 *     travel time results from the Google Distance Matrix API.
 * @throws {Error} - Throws an error if the API request fails.
 */
async function calculateBatchTravelTimes(origins, destination) {
  const apiKey = "AIzaSyDKQh5oq4tkN5rccotcz5A0Fs_xjNhn9g0";
  const originsString = origins.join("|");
  const destinationString = `${destination.lat},${destination.lng}`;
  const gUrl = "https://maps.googleapis.com/maps/api/distancematrix/json?origins=";
  const dtUrl = "&destinations=";
  const keyUrl = "&key=";

  const url = gUrl+originsString+dtUrl+destinationString+keyUrl+apiKey;

  try {
    const response = await axios.get(url);
    return response.data.rows; // Returns an array of results
  } catch (error) {
    console.error("Error fetching travel times:", error);
    throw error;
  }
}

/**
 * Saves user data to Firestore upon account creation.
 *
 * @function saveUserDataOnCreate
 * @param {Object} req - HTTP request object.
 * @param {Object} res - HTTP response object.
 * @returns {void} Responds with JSON indicating success or error.
 */
exports.saveUser = functions
    .runWith({enforceAppCheck: true})
    .https.onRequest((req, res) => {
      // Enable CORS and validate request method
      corsOptions(req, res, async () => {
        if (req.method !== "POST") {
          return res.status(405).json({
            error: "Method not allowed",
            created: false,
          });
        }

        // Destructure required fields from the request body
        const {uid, email, cellNumber} = req.body;

        /**
         * Validate the presence of uid, email, and cellNumber.
         * If missing, respond with an error.
         */
        if (!uid || !email || !cellNumber) {
          return res.status(400).json({
            error: "Missing required details: uid, email, and cellNumber.",
            created: false,
          });
        }

        try {
          // Verify if the user exists in Firebase Authentication
          const user = await admin.auth().getUser(uid);
          console.log("User exists:", user.uid);

          // Prepare user data for Firestore
          const userData = {
            email,
            cellNumber,
            admin: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          // Save user data to Firestore in 'users' collection
          await db.collection("users").doc(uid).set(userData);

          // Respond with success message
          return res.status(200).json({
            created: true,
            message: "User data saved successfully.",
          });
        } catch (error) {
          console.error("Error occurred:", error);

          /**
           * Handle user-not-found error explicitly.
           * Respond with a generic error for other issues.
           */
          if (error.code === "auth/user-not-found") {
            return res.status(400).json({
              error: "User does not exist.",
              created: false,
            });
          }

          return res.status(500).json({
            error: "Internal server error.",
            created: false,
          });
        }
      });
    });

// Set PayFast API URL (use sandbox for testing)
const PAYFAST_URL = "https://sandbox.payfast.co.za/onsite/process";

// Passphrase for signature generation
const passPhrase = "thegreatmctm";

/**
 * Converts data object to URL-encoded string
 * @param {Object} dataArray - The data to be converted
 * @return {string} URL-encoded parameter string
 */
const dataToString = (dataArray) => {
  let pfParamString = "";
  for (const key in dataArray) {
    if (Object.prototype.hasOwnProperty.call(dataArray, key)) {
      // Append key-value pairs, replacing spaces with "+"
      pfParamString += `${key}=${
        encodeURIComponent(dataArray[key].trim()).replace(/%20/g, "+")
      }&`;
    }
  }
  return pfParamString.slice(0, -1); // Remove last ampersand
};

/**
 * Generates an MD5 signature for data verification.
 * @param {Object} data - Data to be signed.
 * @param {string|null} passPhrase - Optional passphrase for signing.
 * @return {string} MD5 signature.
 */
const generateSignature = (data, passPhrase = null) => {
  // Create parameter string
  let pfOutput = "";
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      if (data[key] !== "") {
        pfOutput += `${key}=${
          encodeURIComponent(data[key].trim()).replace(/%20/g, "+")
        }&`;
      }
    }
  }

  // Remove the last ampersand
  let getString = pfOutput.slice(0, -1);
  if (passPhrase !== null) {
  // Add passphrase to the string if provided
    getString += `&passphrase=${
      encodeURIComponent(passPhrase.trim()).replace(/%20/g, "+")
    }`;
  }

  // Return MD5 hashed signature
  return crypto.createHash("md5").update(getString).digest("hex");
};

/**
 * Cloud Function to get payment identifier from PayFast
 */
exports.getPaymentIdentifier = functions
    .runWith({enforceAppCheck: true})
    .https.onRequest((req, res) => {
      corsOptions(req, res, async () => {
        const {bookingId, amount, type} = req.body;

        if (!name && !amount) {
          return res.status(400).json({
            error: "Booking ID and amount are required.",
          });
        }

        try {
          // Fetch booking details from Firestore
          const notUrlHalf = "https://us-central1-thatothemc.";
          const secondHalf = "cloudfunctions.net/getPaymentNotification";

          // Prepare payment data
          const pData = {
            merchant_id: "10028790",
            merchant_key: "t64y1dl1uv2bv",
            notify_url: notUrlHalf + secondHalf,
            name,
            amount,
          };

          // Generate signature and add it to payment data
          pData["signature"] = generateSignature(pData, passPhrase);
          console.log("identifier sig", pData["signature"]);

          // Convert payment data to URL-encoded string
          const pfParamString = dataToString(pData);

          // Send request to PayFast for payment identifier
          const response = await axios.post(PAYFAST_URL, pfParamString);
          const identifier = response.data.uuid || null;

          // Send identifier to client
          res.status(200).json({identifier});
        } catch (error) {
          console.error("Error generating payment identifier:", error);
          res.status(500).json({
            error: "Failed to generate payment identifier",
          });
        }
      });
    });


/**
 * Cloud Function that triggers when a booking document is updated.
 * If a booking is confirmed, sets the `confirmable` field to false
 * for all bookings with the same date in the Firestore collection.
 *
 * @param {functions.Change<functions.firestore.DocumentSnapshot>} change
 *   The Firestore document change event, containing before and after states.
 * @param {functions.EventContext} context - Event context provided by Firebase.
 * @return {Promise<void>} - Returns a promise when the function completes.
 */
exports.updateConfirmableOnConfirm = functions.firestore
    .document("bookings/{bookingId}")
    .onUpdate(async (change, context) => {
      const newValue = change.after.data();
      const previousValue = change.before.data();

      // Check if the `confirmed` field was changed from false to true
      if (newValue.confirmed && !previousValue.confirmed) {
        const bookingDate = newValue.date;

        try {
          const bookingsRef = db.collection("bookings");

          // Query all documents with the same date and `confirmable`
          const snapshot = await bookingsRef
              .where("date", "==", bookingDate)
              .where("confirmable", "==", true)
              .get();

          const batch = db.batch();

          // Set `confirmable` to false for all matching documents
          snapshot.forEach((doc) => {
            batch.update(doc.ref, {confirmable: false});
          });

          // Commit the batch update
          await batch.commit();
          console.log(
              "Updated confirmable fields for bookings with the same date.",
          );
        } catch (error) {
          console.error("Error updating confirmable fields: ", error);
        }
      }
    });

/**
 * HTTPS Cloud Function to check if a specific date is available for booking.
 * Checks if there are any confirmed bookings for the specified date.
 *
 * @param {functions.https.Request} req - The request object, containing the
 *   `date` field in the body in `YYYY-MM-DD` format.
 * @param {functions.Response} res - The response object used to send back
 *   the availability status.
 * @return {Promise<void>} - Returns a promise when the function completes.
 */
exports.checkDateAvailability = onRequest((req, res) => {
  corsOptions(req, res, async () => {
    // Verify request method
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    // Extract date from request body
    const {date} = req.body;
    if (!date) {
      return res.status(400).json({error: "Date is required."});
    }

    try {
      const bookingsRef = db.collection("bookings");

      // Query for confirmed bookings on the given date
      const snapshot = await bookingsRef
          .where("date", "==", date)
          .where("confirmed", "==", true)
          .limit(1)
          .get();

      // If no confirmed bookings found, date is available
      const isAvailable = snapshot.empty;

      return res.status(200).json({
        date: date,
        available: isAvailable,
        message: isAvailable ?
           "The date is available." :
           "The date is already booked.",
      });
    } catch (error) {
      console.error("Error checking date availability: ", error);
      return res.status(500).json({
        error: "An error occurred while checking availability.",
      });
    }
  });
});

/**
 * Calculates the Haversine distance between two points on Earth.
 * @param {number} lat1 - Latitude of the first point.
 * @param {number} lng1 - Longitude of the first point.
 * @param {number} lat2 - Latitude of the second point.
 * @param {number} lng2 - Longitude of the second point.
 * @return {Promise<number>} - The distance between the points in kilometers.
 */
async function calculateDistanceHaversine(lat1, lng1, lat2, lng2) {
  const R = 6371; // Radius of Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Creates a new booking, calculates the cost, and returns the booking ID.
 * @param {object} req - Express request object.
 * @param {object} req.body - The request body containing booking info.
 * @param {string} req.body.userId - The ID of the user creating the booking.
 * @param {string} req.body.date - The date of the event.
 * @param {string} req.body.eventType - The type of event.
 * @param {Array<number>} req.body.userCoordinates - Coordinates of the user.
 * @param {object} res - Express response object.
 * @return {Promise<void>} - Returns the booking ID as a response.
 */
exports.createBooking = functions
    .runWith({enforceAppCheck: true})
    .https.onRequest((req, res) => {
      corsOptions(req, res, async () => {
        try {
          console.log("projectId:", admin.app().options);
          // Extract userTokenId from the Authorization header
          const authorizationHeader = req.headers.authorization;
          const idToken = authorizationHeader &&
          authorizationHeader.split("Bearer ")[1];
          console.log(!idToken);
          if (!idToken) {
            console.log("have entered for some weird reason");
            return res.status(401).send({error: "Auth token missing"});
          }
          let decodedToken;
          try {
            decodedToken = await admin.auth().verifyIdToken(idToken);
            console.log("decoded", decodedToken);
          } catch (error) {
            console.error("Verification failed:", error);
          }
          const userId = decodedToken.uid;
          console.log(userId);

          // Extract booking details from the request body
          const {date, eventType, userCoordinates} = req.body;
          if (!date || !eventType || !userCoordinates) {
            return res.status(400).send({
              error: "Invalid Inputs.",
            });
          }

          const emceeCoordinates = {
            lat: -24.526627030733763, lng: 30.063475070437796,
          };
          const basePrice = 1500;
          const pricePerKm = 4;

          let distance;
          const originLat = userCoordinates.lat;
          const originLng = userCoordinates.lng;
          const latAdjustment = 0.09;
          const cosine = Math.cos((originLat * Math.PI) / 180);
          const lngAdjustment = latAdjustment / cosine;
          const minLat = originLat - latAdjustment;
          const maxLat = originLat + latAdjustment;
          const minLng = originLng - lngAdjustment;
          const maxLng = originLng + lngAdjustment;

          const distancesRef = db.collection("distances");
          const snapshot = await distancesRef
              .where("coordinates.origin.lat", ">=", minLat)
              .where("coordinates.origin.lat", "<=", maxLat)
              .where("coordinates.origin.lng", ">=", minLng)
              .where("coordinates.origin.lng", "<=", maxLng)
              .get();

          if (!snapshot.empty) {
            for (const doc of snapshot.docs) {
              const data = doc.data();
              const distanceToCachedLocation = calculateDistanceHaversine(
                  originLat,
                  originLng,
                  data.coordinates.origin.lat,
                  data.coordinates.origin.lng,
              );
              if (distanceToCachedLocation <= 10) {
                distance = data.distance;
                break;
              }
            }
          }

          if (distance === undefined) {
            const googleApiKey = `AIzaSyDKQh5oq4tkN5rccotcz5A0Fs_xjNhn9g0`;
            const url = `https://maps.googleapis.com` +
                        `/maps/api/distancematrix/json?` +
                        `units=metric&origins=` +
                        `${emceeCoordinates.lat},${emceeCoordinates.lng}` +
                        `&destinations=${userCoordinates.lat},` +
                        `${userCoordinates.lng}` +
                        `&key=${googleApiKey}`;
            const response = await axios.get(url);
            const data = response.data;

            if (data.rows[0].elements[0].status === "OK") {
              distance = data.rows[0].elements[0].distance.value / 1000;

              await distancesRef.doc(
                  `${emceeCoordinates.lat}_${emceeCoordinates.lng}_` +
                `${userCoordinates.lat}_${userCoordinates.lng}`,
              ).set({
                coordinates: {origin: emceeCoordinates,
                  destination: userCoordinates},
                distance,
              });
            } else {
              return res.status(400).send({error: "Could not get distance"});
            }
          }

          const transportCost = distance * pricePerKm;
          const strPrice = formatPaymentValue((basePrice + transportCost));
          const totalPrice = parseFloat(strPrice).toFixed(2);
          const bookingsRef = db.collection("bookings");
          const bookingData = {
            userId,
            date,
            eventType,
            location: userCoordinates,
            totalPrice,
            confirmed: false,
            confirmable: true,
            amount_paid: 0,
            outstanding: true,
          };
          const bookingRef = await bookingsRef.add(bookingData);

          res.send({bookingId: bookingRef.id});
        } catch (error) {
          res.status(500).send({
            error: "Booking creation failed", details: error.message,
          });
        }
      });
    });

/**
 * Cloud Function to assign admin role to a user.
 * Only an existing admin can call this function to promote another user.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The response status and message.
 */
exports.setAdminRole = functions
    .runWith({enforceAppCheck: true}) // Configure execution environment
    .https.onRequest((req, res) => {
      corsOptions(req, res, async () => {
        // Ensure the request method is POST
        if (req.method !== "POST") {
          return res.status(405).send("Method Not Allowed");
        }

        // 1. Get the ID token from the request's Authorization header
        const authorizationHeader = req.headers.authorization;
        const idToken = authorizationHeader &&
          authorizationHeader.split("Bearer ")[1];

        if (!idToken) {
          return res.status(403).send("Unauthorized");
        }

        try {
          // 2. Verify the ID token to get the user's UID
          const decodedToken = await admin.auth().verifyIdToken(idToken);
          const uid = decodedToken.uid;

          // 3. Check if the user is an admin in the Firestore users collection
          const userDoc = await admin.firestore().collection("users")
              .doc(uid).get();

          if (!userDoc.exists) {
            return res.status(404).send("User not found");
          }

          const userData = userDoc.data();
          if (!userData.admin) {
            return res.status(403)
                .send("Permission denied: User is not an admin");
          }

          const targetUid = req.body.targetUid;

          // Check if the target user exists in Firestore
          const targetUserDoc = await admin.firestore().collection("users")
              .doc(targetUid).get();
          if (!targetUserDoc.exists) {
            return res.status(404).send("Target user not found");
          }

          // 5. Set custom claims for the target user (e.g., admin role)
          await admin.auth().setCustomUserClaims(targetUid, {admin: true});

          await admin.firestore().collection("users").doc(targetUid).update({
            admin: true,
          });

          // 7. Respond back confirming the role has been assigned
          res.status(200)
              .send({message: `Admin role assigned to user ${targetUid}`});
        } catch (error) {
          console.error("Error setting custom claims:", error);
          res.status(500).send("Internal server error");
        }
      });
    });
/**
 * Converts a string of key-value pairs into an object.
 *
 * The input string should consist of key-value pairs separated by commas,
 *
 * @param {string} str - The string containing key-value pairs to be converted.
 * @return {Object} An object representation of the key-value pairs.
 */
function objectify(str) {
  const object = {};
  const keyValuePairs = String(str).split(",");
  for (const keyValuePair of keyValuePairs) {
    const [key, value] = keyValuePair.split(":");
    object[key.trim()] = value.trim();
  }
  return object;
}

const payfastOrigins = [
  "www.payfast.co.za",
  "sandbox.payfast.co.za",
  "w1w.payfast.co.za",
  "w2w.payfast.co.za",
];

const payFastCorsOptions = cors({
  origin: (origin, callback) => {
    console.log(origin);
    if (!origin) {
      callback(null, true);
    } else {
      callback(new Error("Not Allowed by CORS"));
    }
  },
});

const testingMode = true;
const pfHost = testingMode ? "sandbox.payfast.co.za": "www.payfast.co.za";

const pfValidateSignature = (pfData, pfParamString, passPhrase = null) => {
  if (passPhrase !== null) {
    pfParamString +=`&passphrase=${encodeURIComponent(passPhrase.trim())
        .replace(/%20/g, "+")}`;
  }
  const signature = crypto.createHash("md5")
      .update(pfParamString).digest("hex");
  console.log("geberated sig: ", signature);
  return pfData["signature"] === signature;
};

/**
 * Performs a DNS lookup for a given domain to retrieve its IP addresses.
 *
 * This function uses the `dns.lookup` method to fetch all IP addresses
 * associated with the specified domain. It returns a promise that resolves
 * to an array of IP addresses or rejects with an error if the lookup fails.
 *
 * @async
 * @param {string} domain - The domain name to perform the DNS lookup on
 * (e.g., "example.com").
 * @return {Promise<string[]>} A promise that resolves to an array of IP
 * addresses as strings.
 * @throw {Error} If the DNS lookup fails, the promise is rejected with the
 * corresponding error.
 */
async function ipLookUp(domain) {
  return new Promise((resolve, reject) => {
    dns.lookup(domain, {all: true}, (err, address, family) => {
      if (err) {
        reject(err);
      } else {
        const addresIps = address.map((item) => {
          return item.address;
        });
        resolve(addresIps);
      }
    });
  });
}

/**
 * Resolves the IP addresses for a given domain.
 *
 * This function performs a DNS lookup for the specified domain and retrieves
 * all associated IP addresses. It returns a promise that resolves with an
 * array of IP addresses or rejects if an error occurs during the lookup.
 *
 * @async
 * @param {string} req - The domain name to look up (e.g., "example.com").
 * @return {Promise<string[]>} A promise that resolves to an array of IP
 * addresses as strings.
 * @throw {Error} If the DNS lookup fails, the promise will be rejected with
 * the corresponding error.
 */
const pfValidIP = async (req) => {
  let validIps = [];
  const pfIp = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  try {
    for (const key of Object.keys(payfastOrigins)) {
      const ips = await ipLookUp(payfastOrigins[key]);
      validIps = [...validIps, ...ips];
    }
  } catch (error) {
    console.error(error);
  }

  const uniqueIps = [...new Set(validIps)];
  if (uniqueIps.includes(pfIp)) {
    return true;
  }
  return false;
};

const pfValidServerConfirmation = async (pfHost, pfParamString) => {
  const result = await axios.post(`https://${pfHost}/eng/query/validate`, pfParamString)
      .then((res) => {
        return res.data;
      })
      .catch((error) => {
        console.error(error);
      });
  return result === "VALID";
};

exports.getPaymentNotification = functions
    .https.onRequest((req, res) => {
      payFastCorsOptions(req, res, async ()=>{
        try {
          const pData = JSON.parse(JSON.stringify(req.body));
          console.log(pData);

          if (pData["payment_status"] !== "COMPLETE") {
            return res.status(200).send("Incomplete payment");
          }
          let pfParamString = "";

          for (const key in pData) {
            if (Object.prototype.hasOwnProperty.call(pData, key) &&
            key !== "signature") {
              pfParamString += `${key}=${
                encodeURIComponent(pData[key].trim()).replace("/%20/g", "+")}&`;
            }
          }
          pfParamString = pfParamString.slice(0, -1);
          const params = new URLSearchParams(req.body);
          params.delete("signature");
          const stringToVal = params.toString();

          const check1 = pfValidateSignature(pData, stringToVal, passPhrase);
          const check2 = await pfValidIP(req);
          const check3 = await pfValidServerConfirmation(pfHost, pfParamString);
          if (check1 && check2 && check3) {
            const amount = pData["amount_gross"];
            const details = objectify(pData["item_name"]);
            console.log("details :", details);
            const bookingId = details["Booking ID"];
            const type = details["type"];
            try {
              console.log("we do get in here");
              const bookingRef = db.collection("bookings").doc(bookingId);
              const bookingSnapshot = await bookingRef.get();
              if (!bookingSnapshot.exists) {
                return res.status(200).send("booking dont exist");
              }
              const bookingData = bookingSnapshot.data();
              if (type === "confirm" && amount === "500.00") {
                await bookingRef.update({confirmed: true, amount_paid: 500.00});
              } else if (type === "payAmountOwing") {
                const amountOwing = parseFloat(formatPaymentValue(
                    parseFloat(bookingData.totalPrice) -
                  parseFloat(bookingData.amount_paid),
                )).toFixed(2);
                if (amountOwing.toString() === amount) {
                  await bookingRef.update({amount_paid: bookingData.totalPrice,
                    outstanding: false,
                  });
                }
              } else if (type === "payFullAmount") {
                const fullPrice = parseFloat(
                    formatPaymentValue(
                        parseFloat(bookingData.totalPrice),
                    ),
                ).toFixed(2);
                if (fullPrice.toString() === amount) {
                  await bookingRef.update({
                    amount_paid: fullPrice,
                    confirmed: true,
                    outstanding: false,
                  });
                }
              }
              console.log("Validation and update successful");
              return res.status(200).send("Validation successful");
            } catch (error) {
              console.error("Error updating booking:", error);
              return res.status(200).send("Error processing booking");
            }
          } else {
            console.error("Validation failed:", {check1, check2, check3});
            return res.status(200).send("Validation failed");
          }
        } catch (error) {
          console.error("Error processing request:", error);
          return res.status(200).send("Internal server error");
        }
      });
    });

/**
 * Cancels a booking and processes a refund if applicable.
 *
 * @param {Object} data - The data passed from the client.
 * @param {string} data.bookingId - The ID of the booking to cancel.
 * @param {Object} context - The context of the function call.
 * @param {Object} context.auth - Authentication details of the user.
 * @return {Promise<Object>} Result of the operation.
 * @throws {functions.https.HttpsError} Throws an error if the operation fails.
 */
exports.cancelBooking = functions.https.onCall(async (data, context) => {
  console.log(data);
  const {message, bookingId} = data;
  console.log(message);

  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated.",
    );
  }

  const userId = context.auth.uid;

  try {
    await db.runTransaction(async (transaction) => {
      const bookingRef = db.collection("bookings").doc(bookingId);
      const bookingDoc = await transaction.get(bookingRef);

      // Check if booking exists
      if (!bookingDoc.exists) {
        throw new functions.https.HttpsError(
            "not-found",
            "Booking not found.",
        );
      }

      const booking = bookingDoc.data();

      // Ensure the user is authorized
      if (booking.userId !== userId) {
        throw new functions.https.HttpsError(
            "permission-denied",
            "You cannot cancel this booking.",
        );
      }

      // Add refund entry if booking is fully paid
      if (!booking.outsanding) {
        const refundRef = db.collection("refunds").doc();
        transaction.set(refundRef, {
          userId,
          bookingId,
          amount: booking.amount_paid,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          status: "pending",
        });
      }

      // Delete or mark booking as canceled
      transaction.delete(bookingRef);
    });

    return {success: true, message: "Booking canceled successfully."};
  } catch (error) {
    console.error("Error canceling booking:", error);
    throw new functions.https.HttpsError(
        "internal",
        "An error occurred while canceling the booking.",
    );
  }
});

/**
 * Firestore trigger that runs when a booking document is deleted.
 * If the deleted booking was confirmed, it updates all bookings on
 * the same date to set their `confirmable` property to true.
 */
exports.onBookingDelete = functions.firestore
    .document("bookings/{bookingId}")
    .onDelete(async (snapshot, context) => {
      try {
        // Access the deleted document's data
        const deletedBooking = snapshot.data();

        // Check if the booking was confirmed
        if (deletedBooking && deletedBooking.confirmed === true) {
          const bookingDate = deletedBooking.date;

          // Query all bookings with the same date
          const bookingsQuery = db
              .collection("bookings")
              .where("date", "==", bookingDate);

          const bookingsSnapshot = await bookingsQuery.get();

          const updatePromises = [];
          bookingsSnapshot.forEach((doc) => {
            const booking = doc.data();
            if (booking.confirmable === false) {
              // Update the `confirmable` property to `true`
              updatePromises.push(
                  doc.ref.update({confirmable: true}),
              );
            }
          });

          // Wait for all updates to complete
          await Promise.all(updatePromises);

          console.log(
              `Successfully updated bookings on ${bookingDate}.`,
          );
        }
      } catch (error) {
        console.error("Error handling booking deletion:", error);
      }
    });

