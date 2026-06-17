const { SlashCommandBuilder } = require('discord.js');
const monitorStore = require("../../monitorStore");
const factionName = require("../../factionName");
require('dotenv').config();

module.exports = {
    data: new SlashCommandBuilder().setName("listmonitor").setDescription("Lists all factions currently being monitored"),
    async execute(interaction) {
        const channel = interaction.client.channels.cache.get(process.env.CHANNEL_ID);
        try {
            let str = "";
            [...monitorStore.keys()].foreach(key => str += `${factionName.get(key)} (${key}) `);
            interaction.reply(str);
        }
        catch(e) {
            channel.send(`Error while listing factions ${e}`);
            console.log(`Error while listing factions ${e}`);
        }
    }
}