const { SlashCommandBuilder } = require('discord.js');
const db = require("../../db.js");

module.exports = {
    data: new SlashCommandBuilder().setName("listfac").setDescription("Lists all factions whose activity is stored"),
    async execute(interaction) {
        const channel = interaction.client.channels.cache.get(process.env.CHANNEL_ID);
        try {
            let str = "";
            const [facs] = await db.execute('SELECT name, id FROM faction_name');
            for(const fac of facs) {
                const [data] = await db.execute('SELECT 1 FROM faction_activity WHERE id = ?', [fac.id]);
                str += `${fac.name} (${data.length} data points), `;
            }
            if(str.length == 0)
                return interaction.reply("No faction activity stored");
            str = str.substring(0, str.length - 2);
            return interaction.reply(str);
        }
        catch(e) {
            channel.send(`Error while listing factions ${e}`);
            console.log(`Error while listing factions ${e}`);
        }
    }
}