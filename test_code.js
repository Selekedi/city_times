fetch("http://localhost:3000/api/add",{
    method:"POST",
    headers:{
        "Content-Type":"application/json"
    },
    body:JSON.stringify({content:"text here"})
}).then(res => res.json())
.then(data => {
    console.log(data)
})
.catch(err => {
    console.error(err)
})