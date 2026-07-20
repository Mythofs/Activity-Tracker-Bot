async function safeFetch(url) {
    for(let i = 0; i < 5; i++) {
        try {
            const response = await fetch(url);
            const data = await response.json();
            if(!response.ok) throw new Error("Invalid response");
            return data;
        }
        catch(e) {
            if(i < 4) {
                await new Promise(r => setTimeout(r, 100 * (i + 1)));
                continue;
            }
            throw e;
        }
    }
}
module.exports = safeFetch;