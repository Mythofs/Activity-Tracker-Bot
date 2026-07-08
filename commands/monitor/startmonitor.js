const { SlashCommandBuilder } = require('discord.js');
const db = require("../../db.js");
const safeFetch = require("../../safeFetch.js");

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
            await db.execute("INSERT IGNORE INTO monitor_store (id) VALUES (?)", [facId]);
            return interaction.editReply(`Started monitoring ${facInfo.basic.name}`);
        }
        catch(e) { return interaction.editReply(`Error while starting monitoring ${e}`); }
    },
}