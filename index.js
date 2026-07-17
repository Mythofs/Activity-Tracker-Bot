const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../private/.env") });
const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require("discord.js");
const fs = require("node:fs");
const db = require("./db.js");
const safeFetch = require("./safeFetch.js");

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
    await db.execute("CREATE TABLE IF NOT EXISTS faction_activity (id INTEGER, name VARCHAR(255), timestamp BIGINT, numactive INTEGER, PRIMARY KEY (id, timestamp))");
    await db.execute("CREATE TABLE IF NOT EXISTS individual_activity (id INTEGER, name VARCHAR(255), facid INTEGER, timestamp BIGINT, active INTEGER, PRIMARY KEY (id, timestamp))");
    await db.execute("CREATE TABLE IF NOT EXISTS monitor_store (id INTEGER UNIQUE)");
    monitorInterval(apiKey, channel);
    setInterval(async() => await monitorInterval(apiKey, channel),  3600000);
});
client.login(process.env.TOKEN);

async function monitorInterval(apiKey, channel)
{
    try {
        const [rows] = await db.execute("SELECT id FROM monitor_store");
        for(const row of rows)
        {
            const facId = row.id;
            const memberData = await safeFetch(`https://api.torn.com/v2/faction/${facId}/members?striptags=true&comment=Activity%20Tracker%20Bot&key=${apiKey}`, channel);
            checkActivity(apiKey, facId, channel, memberData);
        }
        await db.execute("DELETE FROM faction_activity WHERE timestamp < ?", [Date.now() - 604800000]);
        await db.execute("DELETE FROM individual_activity WHERE timestamp < ?", [Date.now() - 604800000]);
    }
    catch(e) {
        channel.send(`Error while checking activity ${e}`);
        console.log(`Error while checking activity ${e}`);
    }
}
async function checkActivity(apiKey, facId, channel, memberData) {
    try {    
        const memberData = await safeFetch(`https://api.torn.com/faction/${facId}?selections=basic&key=${apiKey}`)
        let count = 0;
        for(const [id, member] of Object.entries(memberData.members)) {
            if(member.last_action.status == "Online" || member.last_action.status == "Idle" && Date.now() - member.last_action.timestamp * 1000 < 3600000) {
                console.log(member.name);
                await db.execute("REPLACE INTO individual_activity VALUES (?, ?, ?, ?, ?)", [id, member.name, facId, Date.now(), 1]);
                count++;
            }
            else
                await db.execute("REPLACE INTO individual_activity VALUES (?, ?, ?, ?, ?)", [member.id, member.name, facId, Date.now(), 0]);
        }
        await db.execute("REPLACE INTO faction_activity VALUES (?, ?, ?, ?)", [facId, memberData.name, Date.now(), count]);
    }
    catch(e) {
        channel.send(`Error while checking activity ${e}`);
        console.log(`Error while checking activity ${e}`);
    }
}