const { SlashCommandBuilder } = require('discord.js');
const monitorStore = require("../../monitorStore");
const db = require("../../db.js");

module.exports = {
    data: new SlashCommandBuilder().setName("startmonitor").setDescription("Starts monitoring a faction's activity")
        .addStringOption((option) => option.setName("id").setDescription("The faction to monitor").setRequired(true)),
    async execute(interaction) {
        try {
            const channel = interaction.client.channels.cache.get(process.env.CHANNEL_ID);
            const facId = interaction.options.getString("id", true);
            const facInfo = await safeFetch(`https://api.torn.com/v2/faction/${facId}/basic?comment=Activity%20Tracker&key=${process.env.API_KEY}`);
            await db.execute('REPLACE INTO faction_name VALUES (?, ?)', [Number(facId), facInfo.basic.name]);
            await startActivityInterval(process.env.API_KEY, facId, facInfo, channel);
            interaction.reply(`Started monitoring ${facInfo.basic.name}`);
        }
        catch(e) { interaction.reply(`Error while starting monitoring ${e}`); }
    },
    startActivityInterval,
}
async function startActivityInterval(apiKey, facId, facInfo, channel)
{
    try {
        facId = Number(facId);
        checkActivity(apiKey, facId, channel);
        const intervalId = setInterval(async () => {
            checkActivity(apiKey, facId, channel);
        }, 300000);
        monitorStore.set(facId, intervalId);
        setTimeout(async () => {
            monitorStore.delete(facId);
            clearInterval(intervalId);
            channel.send(`Completed monitoring of ${facId}`);
        }, 86400000);
    }
    catch(e) {
        channel.send(`Error while starting activity interval ${e}`);
        console.log(`Error while starting activity interval ${e}`);
    }
}
async function checkActivity(apiKey, facId, channel) {
    try {    
        const memberData = await safeFetch(`https://api.torn.com/v2/faction/${facId}/members?striptags=true&comment=Activity%20Tracker%20Bot&key=${apiKey}`)
        let count = 0;
        for(const member of memberData.members) {
            await db.execute('INSERT IGNORE INTO individual_name VALUES (?, ?)', [member.id, member.name]);
            if(member.last_action.status == "Online" || member.last_action.status == "Idle" && Date.now() - new Date(member.last_action.stamp).getDate() < 300000) {
                console.log(member.name);
                await db.execute('REPLACE INTO individual_activity VALUES (?, ?, ?)', [member.id, Date.now(), 1]);
                count++;
            }
            await db.execute('REPLACE INTO individual_activity VALUES (?, ?, ?)', [member.id, Date.now(), 0]);
        }
        await db.execute('REPLACE INTO faction_activity VALUES (?, ?, ?)', [facId, Date.now(), count]);
    }
    catch(e) {
        channel.send(`Error while checking activity ${e}`);
        console.log(`Error while checking activity ${e}`);
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