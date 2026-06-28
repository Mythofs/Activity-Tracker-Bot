const { SlashCommandBuilder } = require('discord.js');
const monitorStore = require("../../monitorStore");
const db = require("../../db.js");

module.exports = {
    data: new SlashCommandBuilder().setName("startmonitor").setDescription("Starts monitoring a faction's activity")
        .addStringOption((option) => option.setName("id").setDescription("The faction to monitor").setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply();
        const channel = interaction.client.channels.cache.get(process.env.CHANNEL_ID);
        try {
            const facId = interaction.options.getString("id", true);
            await db.execute('DELETE FROM faction_activity WHERE id = ?', [facId]);
            const facInfo = await safeFetch(`https://api.torn.com/v2/faction/${facId}/basic?comment=Activity%20Tracker&key=${process.env.API_KEY}`, channel);
            await db.execute('REPLACE INTO faction_name VALUES (?, ?)', [Number(facId), facInfo.basic.name]);
            await startActivityInterval(process.env.API_KEY, facId, facInfo, channel);
            return interaction.editReply(`Started monitoring ${facInfo.basic.name}`);
        }
        catch(e) { return interaction.editReply(`Error while starting monitoring ${e}`); }
    },
    startActivityInterval,
}
async function startActivityInterval(apiKey, facId, facInfo, channel)
{
    try {
        facId = Number(facId);
        const memberData = await safeFetch(`https://api.torn.com/v2/faction/${facId}/members?striptags=true&comment=Activity%20Tracker%20Bot&key=${apiKey}`, channel)
        for(const member of memberData.members)
            await db.execute('DELETE FROM individual_activity WHERE id = ?', [member.id]);
        checkActivity(apiKey, facId, channel, memberData);
        const intervalId = setInterval(async () => {
            const memberData = await safeFetch(`https://api.torn.com/v2/faction/${facId}/members?striptags=true&comment=Activity%20Tracker%20Bot&key=${apiKey}`, channel)
            checkActivity(apiKey, facId, channel, memberData);
            const [rows] = await db.execute('SELECT 1 FROM faction_activity WHERE id = ?', [facId]);
            if(rows >= 240) {
                monitorStore.delete(facId);
                clearInterval(intervalId);
                channel.send(`Completed monitoring of ${facId}`);
            }
        }, 600000);
        monitorStore.set(facId, intervalId);
    }
    catch(e) {
        channel.send(`Error while starting activity interval ${e}`);
        console.log(`Error while starting activity interval ${e}`);
    }
}
async function checkActivity(apiKey, facId, channel, memberData) {
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