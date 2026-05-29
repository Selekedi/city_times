const recievedTableBody = document.querySelector(".donated table tbody")
const whatDone = document.querySelector(".what-done table tbody")


const recieved = [
    {
        id:1,
        name:"st marks",
        item:"Cash",
        amount:200
    },
    {
        id:2,
        name:"jf city college",
        item:"Airtime",
        amount:100
    },
    {
        id:3,
        name:"jf marks",
        item:"Mics",
        amount:300
    }
]

const recievedHtml_ = recieved.map(item => {
    const html = `
        <tr>
            <td>${item.name}</td>
            <td>${item.item}</td>
            <td>R${item.amount}</td>
        </tr>
    `
    return html

}).join("")

recievedTableBody.innerHTML = recievedHtml_

const used = [
    {
        id:1,
        item:"Refreshments",
        amount:100,
        evidence:"./donate.html"
    },
    {
        id:2,
        item:"Event Tickets",
        amount:80,
        evidence:"./donate.html"
    },
    {
        id:3,
        item:"Mobile Data",
        amount:150,
        evidence:"./donate.html"
    },
    {
        id:4,
        item:"Fuel",
        amount:200,
        evidence:"./donate.html"
    }
]

const usedHtml_ = used.map(item => {
    const html = `
        <tr>
            <td>${item.item}</td>
            <td>${item.amount}</td>
            <td><a href ="${item.evidence}">Link</td>
        </tr>
    `
    return html

}).join("")

whatDone.innerHTML = usedHtml_

