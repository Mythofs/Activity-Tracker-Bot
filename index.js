const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../private/.env") });
const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require("discord.js");
const fs = require("node:fs");
const safeFetch = require("./safeFetch.js");
const queryRetry = require("./queryRetry.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
const foldersPath = path.join(__dirname, "commands");
const commandFolders = fs.readdirSync(foldersPath);

for(const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));
    for(const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if("data" in command && "execute" in command)
            client.commands.set(command.data.name, command);
        else
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

const eventsPath = path.join(__dirname, "events");
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"));

for(const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if(event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    }
    else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

client.once("clientReady", async () => {
    const apiKey = process.env.API_KEY;
    const channel = await client.channels.fetch(process.env.CHANNEL_ID);
    await queryRetry("CREATE TABLE IF NOT EXISTS faction_activity (id INTEGER, name VARCHAR(255), timestamp BIGINT, numactive INTEGER, PRIMARY KEY (id, timestamp))");
    await queryRetry("CREATE TABLE IF NOT EXISTS individual_activity (id INTEGER, name VARCHAR(255), facid INTEGER, timestamp BIGINT, active INTEGER, PRIMARY KEY (id, timestamp))");
    await queryRetry("CREATE TABLE IF NOT EXISTS monitor_store (id INTEGER UNIQUE, name VARCHAR(255))");
    const rows = await queryRetry("SELECT id FROM monitor_store");
    let waitTime = 0;
    for(const row of rows) {
        const fac = await queryRetry("SELECT timestamp FROM faction_activity WHERE id = ? ORDER BY timestamp DESC LIMIT 1", [row.id]);
        if(fac.length > 0) {
            waitTime = fac[0].timestamp + 3600000 * Math.ceil((Date.now() - fac[0].timestamp) / 3600000) - Date.now();
            break;
        }
    }
    if(waitTime !== 0)
        await new Promise(r => setTimeout(r, waitTime));
    monitorInterval(apiKey, channel);
    setInterval(async() => await monitorInterval(apiKey, channel),  3600000);
});
client.login(process.env.TOKEN);

async function monitorInterval(apiKey, channel)
{
    try {
        const rows = await queryRetry("SELECT id FROM monitor_store");
        for(const row of rows)
        {
            const facId = row.id;
            checkActivity(apiKey, facId, channel);
            console.log(`Activity checked for ${facId}`);
        }
        await queryRetry("DELETE FROM faction_activity WHERE timestamp < ?", [Date.now() - 604800000]);
        await queryRetry("DELETE FROM individual_activity WHERE timestamp < ?", [Date.now() - 604800000]);
    }
    catch(e) {
        channel.send(`Error while checking activity ${e}`);
        console.log(e);
    }
}
async function checkActivity(apiKey, facId, channel) {
    try {    
        const memberData = await safeFetch(`https://api.torn.com/faction/${facId}?selections=basic&key=${apiKey}&comment=ActivityTracker`);
        if(!memberData) return;
        let count = 0;
        for(const [id, member] of Object.entries(memberData.members)) {
            if(Date.now() - member.last_action.timestamp * 1000 < 3600000) {
                await queryRetry("REPLACE INTO individual_activity VALUES (?, ?, ?, ?, ?)", [id, member.name, facId, Date.now(), 1]);
                count++;
            }
            else
                await queryRetry("REPLACE INTO individual_activity VALUES (?, ?, ?, ?, ?)", [id, member.name, facId, Date.now(), 0]);
        }
        await queryRetry("REPLACE INTO faction_activity VALUES (?, ?, ?, ?)", [facId, memberData.name, Date.now(), count]);
    }
    catch(e) {
        channel.send(`Error while checking activity ${e.message}`);
        console.log(e);
    }
}