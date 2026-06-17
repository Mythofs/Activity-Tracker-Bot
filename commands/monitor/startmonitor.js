const { SlashCommandBuilder } = require('discord.js');
const factionActivityStore = require('../../factionActivityStore');
const individualActivityStore = require('../../individualActivityStore')
require('dotenv').config();

module.exports = {
    data: new SlashCommandBuilder().setName("startmonitor").setDescription("Starts monitoring a faction's activity")
        .addStringOption((option) => option.setName("id").setDescription("The faction to monitor").setRequired(true)),
    async execute(interaction) {
        const channel = interaction.client.channels.cache.get(process.env.CHANNEL_ID);
        const facId = interaction.options.getString("id", true);
        interaction.reply(`Started monitoring ${facId}`);
        startActivityInterval(process.env.API_KEY, facId, channel);
    },
    startActivityInterval,
}
async function startActivityInterval(apiKey, facId, channel)
{
    try {
        facId = Number(facId);
        if(!factionActivityStore.has(facId))
            factionActivityStore.set(facId, new Map());
        checkActivity(apiKey, facId, channel);
        const intervalId = setInterval(async () => {
            checkActivity(apiKey, facId, channel);
        }, 300000);
        setTimeout(async () => {
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
            if(!individualActivityStore.has(member.id))
                individualActivityStore.set(member.id, new Map());
            if(member.last_action.status == "Online" || member.last_action.status == "Idle" && Date.now() - new Date(member.last_action.stamp).getDate() < 300000) {
                console.log(member.name);
                count++;
                if(individualActivityStore.has(member.id))
                    individualActivityStore.get(member.id).set(Date.now(), true);
            }
        }
        factionActivityStore.get(facId).set(Date.now(), count);
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