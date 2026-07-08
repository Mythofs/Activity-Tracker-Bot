async function safeFetch(url, channel) {
    let response;
    try {
        response = await fetch(url);
    } catch (error) {
        channel.send(`Error while fetching ${url}, ${error}`);
    }
    let data;
    try {
        data = await response.json();
    } catch(error) {
        channel.send(`Invalid JSON from ${url}, ${error}`);
    }
    if (!response.ok)
        channel.send(`Error from ${url}: ${JSON.stringify(data)}`);
    return data;
}
module.exports = safeFetch;