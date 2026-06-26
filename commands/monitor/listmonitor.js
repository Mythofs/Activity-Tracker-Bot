const { SlashCommandBuilder } = require('discord.js');
const monitorStore = require("../../monitorStore");
const db = require("../../db.js");

module.exports = {
    data: new SlashCommandBuilder().setName("listmonitor").setDescription("Lists all factions currently being monitored"),
    async execute(interaction) {
        const channel = interaction.client.channels.cache.get(process.env.CHANNEL_ID);
        try {
            let str = "";
            for(const key of [...monitorStore.keys()]) {
                const [name] = await db.execute('SELECT name FROM faction_name WHERE id = ?', [key]);
                str += `${name[0].name} (${key})`;
            }
            interaction.reply(str);
        }
        catch(e) {
            channel.send(`Error while listing factions ${e}`);
            console.log(`Error while listing factions ${e}`);
        }
    }
}