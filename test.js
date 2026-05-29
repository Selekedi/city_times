const ob = {
    sel:"kedi",
    maf:"ate",
    mpe:"sulu",
    pelo:"mpe"
}

function destructOb(ob){
    return Object.entries(ob).map(item => {
        return [item[0],item[1]]
    })
}

console.log(retHello(ob))
