const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../private/.env') });
const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const fs = require('node:fs');
const { startActivityInterval } = require('./commands/monitor/startmonitor.js');
const db = require("./db.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for(const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
    for(const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if('data' in command && 'execute' in command)
            client.commands.set(command.data.name, command);
        else
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

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

client.once('clientReady', async () => {
    const apiKey = process.env.API_KEY;
    const channel = await client.channels.fetch(process.env.CHANNEL_ID);
    await db.execute('CREATE TABLE IF NOT EXISTS faction_activity (id INTEGER, timestamp BIGINT, numactive INTEGER, PRIMARY KEY (id, timestamp))');
    await db.execute('CREATE TABLE IF NOT EXISTS individual_activity (id INTEGER, timestamp BIGINT, active INTEGER, PRIMARY KEY (id, timestamp))');
    await db.execute('CREATE TABLE IF NOT EXISTS faction_name (id INTEGER UNIQUE, name VARCHAR(255))');
    await db.execute('CREATE TABLE IF NOT EXISTS individual_name (id INTEGER UNIQUE, name VARCHAR(255))');
    startWarInterval(apiKey, channel);
});
client.login(process.env.TOKEN);

async function startWarInterval(apiKey, channel)
{
    try {
        const id = await checkForWar(apiKey, channel);
        if(id != -1) {
            startActivityInterval(apiKey, id, channel);
            startActivityInterval(apiKey, Number(process.env.FAC_ID), channel);
            return;
        }
        const intervalId = setInterval(async () => {
            const id = await checkForWar(apiKey, channel);
            if(id != -1) {
                clearInterval(intervalId);
                startActivityInterval(apiKey, id, channel);
                startActivityInterval(apiKey, Number(process.env.FAC_ID), channel);
                waitForWarEnd(apiKey, channel);
            }
        }, 3600000);
    }
    catch(e) { 
        channel.send(`Error while running war interval ${e}`);
        console.log(`Error while running war interval ${e}`);
    }
}
async function checkForWar(apiKey, channel)
{
    try {
        const warData = await safeFetch(`https://api.torn.com/v2/faction/wars?comment=Activity%20Tracker%20Bot&key=${apiKey}`, channel);
        if(warData.wars.ranked == null || warData.wars.ranked.end != null)
            return -1;
        return warData.wars.ranked.factions.find(fac => fac.id != process.env.FAC_ID).id;
    }
    catch(e) { 
        channel.send(`Error while checking for war ${e}`);
        console.log(`Error while checking for war ${e}`);
        return -1;
    }
}
async function waitForWarEnd(apiKey, channel)
{
    try {
        const warData = await safeFetch(`https://api.torn.com/v2/faction/wars?comment=Activity%20Tracker%20Bot&key=${apiKey}`, channel);
        if(Array.isArray(warData.wars.ranked) || warData.wars.ranked.end != null) {
            startWarInterval(apiKey, channel);
            return;
        }
        const intervalId = setInterval(async () => {
            const warData = await safeFetch(`https://api.torn.com/v2/faction/wars?comment=Activity%20Tracker%20Bot&key=${apiKey}`, channel);
            if(Array.isArray(warData.wars.ranked) || warData.wars.ranked.end != null) {
                clearInterval(intervalId);
                startWarInterval(apiKey, channel);
            }
        })
    }
    catch(e) {
        channel.send(`Error while starting war end interval ${e}`);
        console.log(`Error while starting war end interval ${e}`);
    }
}
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