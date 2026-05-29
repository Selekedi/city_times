/*import { onSnapshot, doc} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { checkUserAuth, checkIfUserEmailVerified,sendVerificationEmail } from "./auth.js";
import { formatPaymentValue, updateSessionStorage } from "./utils.js";
*/

const nameInput = document.querySelector("form #name")
const amountInput = document.querySelector("form #amount")
const donateBtn = document.querySelector("form button")

donateBtn.addEventListener("click",e => {
    console.log("clicked")
    console.log(nameInput.value)
    console.log(amountInput.value)
})

async function getPaymentIdentifier(name,amount) {
try {
    const response = await fetch(
    "https://us-central1-thatothemc.cloudfunctions.net/getPaymentIdentifier",
    {
        method: "POST",
        headers: {
        "Content-Type": "application/json",
        },
        body: JSON.stringify({
            name,
            amount,
         // Example amount
         // Replace with actual email
         // other required fields
        }),
    }
    );

    if (!response.ok) {
        const errorMessage = await response.json()
        throw new Error(`${response.status} , ${errorMessage.error}`);
    }

    const data = await response.json();
    console.log("Payment Identifier:", data.identifier);
    return data.identifier; // Return the identifier
} catch (error) {
    console.error("Error:", error);
    return null; // Return null if there was an error
}
}

// Use the identifier somewhere else in your code
async function processPayment(name,amount) {
    const identifier = await getPaymentIdentifier(name,amount);
    
    if (identifier) {
        // Use the identifier where needed
        console.log("Using Identifier:", identifier);
        // Example of using it in another function
        continuePaymentProcess(identifier);
    } else {
        console.error("Could not retrieve identifier.");
        alert("something went wrong")
    }
}

// Another function that continues with payment processing
function continuePaymentProcess(identifier) {
    // Load the PayFast script and proceed once it's fully loaded
    loadPayfastScript().then(() => {
        // Now you can safely call the on-site payment function
        window.payfast_do_onsite_payment({"uuid": identifier},function(result){
            if(result === true){
                alert("payment successful")
            }
            else{
                alert("payment unsuccessful")
            }
        });
    }).catch(error => {
        console.error("Failed to load PayFast script:", error);
    });
}

function loadPayfastScript() {
    return new Promise((resolve, reject) => {
        if (document.querySelector("script[src='https://sandbox.payfast.co.za/onsite/engine.js']")) {
            resolve(); // Script already loaded
            return;
        }

        const script = document.createElement("script");
        script.src = "https://sandbox.payfast.co.za/onsite/engine.js";

        // Resolve the promise when the script loads successfully
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load the PayFast script."));

        document.head.append(script);
    });
}

