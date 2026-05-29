const cardsContainer = document.querySelector(".cards")

const members = [
    {
        id:1,
        name:"tokelo 'Prime' thobejane",
        talents: "Rapper, Artist,Content Creator",
        image:"prime.jpg",
        socials: {
                facebook:"prime",
                tiktok:"prime"
            }
        
    },
    {
        id:2,
        name:"naledi phetla",
        talents: "Photographer, Content creator",
        socials: {
            
                facebook:"naledi",
                tiktok:"Nale"
            }
        
    }

]

const socialIcons = {
    facebook:"<i class='devicon-facebook-plain'></i>",
    tiktok:"",
    instagram:"",

}

const memberHtml = members.map(member => {
    const html_ = `
        <div class="member-card">
            <div class="img-container">
                <img src="" alt="">
            </div>
            <div class="member-info">
                <strong>${member.name}</strong>
                <div class="socials">
                    ${Object.entries(member.socials).map(social => {
                        return renderSocial(...social)
                    }).join("")}
                </div>
                <p>${member.talents}</p>
            </div>
        </div>
    `
    return html_
}).join("")

cardsContainer.innerHTML = memberHtml



function renderSocial(key,value){
    return `<a href="${value}">${socialIcons[key]}</a>`
}

