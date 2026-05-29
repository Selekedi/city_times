const header = document.querySelector("header")
const navLinks = document.querySelectorAll(".nav-link")
const toggleBtn = document.querySelector("header > button")
const navBar = document.querySelector("header > nav")
const navList = navBar.querySelector("ul")
const sections = document.querySelectorAll("section[id]");
const svg = toggleBtn.querySelector(".burger-6")
const nameOfBusiness = document.querySelectorAll("span.name_of_business")
const cellCont = document.querySelectorAll("span.cell")
const emailCont = document.querySelectorAll("span.email")
const whatsappCont = document.querySelectorAll("span.whatsapp")
const standCont = document.querySelectorAll("span.stand_no")
const sectionCont = document.querySelectorAll("span.section")
const townCont = document.querySelectorAll("span.town")
const postalCodeCont = document.querySelectorAll("span.postal_code")


const copyrightTag = document.querySelector("footer .copyright p")
const today = new Date()


document.addEventListener("DOMContentLoaded", async e => {
  const dataResponse = await fetch("./data.json")
  const data = await dataResponse.json()
  console.log(cellCont)
  copyrightTag.textContent = `© ${today.getFullYear()} ${data.name_of_business}. All rights reserved.`
  cellCont.forEach(span => {
    span.textContent = data["contacts"]["cell"]
  })
  whatsappCont.forEach(span => {
    span.textContent = data["contacts"]["whatsapp"]
  })
  emailCont.forEach(span => {
    span.textContent = data["contacts"]["email"]
  })
  cellCont.forEach(span => {
    span.textContent = data["contacts"]["cell"]
  })
  cellCont.forEach(span => {
    span.textContent = data["contacts"]["cell"]
  })
  cellCont.forEach(span => {
    span.textContent = data["contacts"]["cell"]
  })

})


window.addEventListener("DOMContentLoaded", handleInitialHashScroll);

window.addEventListener('resize', throttle(() => {
    if(window.innerWidth >= 810 && navBar.getBoundingClientRect().height >= 100){ 
      navBar.style.height = navList.getBoundingClientRect().height + "px"
    }
}, 200));


toggleBtn.addEventListener("click", e => {
  if(window.innerWidth <= 810){
    svg.classList.toggle("is-closed")
    if(svg.classList.contains("is-closed")){
      const navListHeight = navList.getBoundingClientRect().height
      navBar.style.height = `${navListHeight + 8}px`
    }else {
      navBar.style.height = `0`
    }
  }
})

navLinks.forEach(link => {
  link.addEventListener("click", e => {
    e.preventDefault()
    const id = e.currentTarget.attributes.href.value.replace("#","")
    navigateById(id)
    if(window.innerWidth <= 810){
      navBar.style.height = `0`
      svg.classList.remove("is-closed")
    }
    
    //pushToHistory(id)
  })
})

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      const id = entry.target.id;
      // Update the hash without scrolling the page
      pushToHistory(id)
    }
  }
}, {
  root: null,                // Observe viewport
  threshold: 0.6,            // Section must be 60% visible
  rootMargin: "0px 0px -30% 0px" // Adjust for fixed header
});

sections.forEach(section => observer.observe(section));

function handleInitialHashScroll() {
  const hash = window.location.hash;
  if (!hash) return;

  const target = document.querySelector(hash);
  if (!target) return;

  // Temporarily remove the id to stop browser scroll
  target.id = "";

  // Wait for page layout to settle
  requestAnimationFrame(() => {
    // Restore the id
    target.id = hash.substring(1);

    // Now scroll using your custom logic
    navigateById(target);
  });
}


function navigateById(id){
  const element = document.getElementById(id)
    const headerHeight = header.getBoundingClientRect().height
    window.scrollTo({
      left:0,
      top: element.offsetTop - headerHeight
    })   
}

function pushToHistory(id){
  history.replaceState(null, "", "#" + id);
}

function throttle(func, limit) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

