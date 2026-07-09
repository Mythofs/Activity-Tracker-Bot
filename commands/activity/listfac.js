const { SlashCommandBuilder } = require('discord.js');
const db = require("../../db.js");

module.exports = {
    data: new SlashCommandBuilder().setName("listfac").setDescription("Lists all factions whose activity is stored"),
    async execute(interaction) {
        const channel = interaction.client.channels.cache.get(process.env.CHANNEL_ID);
        try {
            let str = "";
            const [facs] = await db.execute("SELECT id, name FROM faction_activity");
            const [monitoring] = await db.execute("SELECT id FROM monitor_store");
            const monitorStore = monitoring.map(monitor => monitor.id);
            for(const fac of facs) {
                const [data] = await db.execute("SELECT 1 FROM faction_activity WHERE id = ?", [fac.id]);
                str += `\n${fac.name} (${fac.id}), ${data.length} data points`;
                if(monitorStore.includes(fac.id))
                    str += ", currently being tracked";
            }
            if(str.length == 0)
                return interaction.reply("No faction activity stored");
            return interaction.reply(str);
        }
        catch(e) {
            channel.send(`Error while listing factions ${e}`);
            console.log(`Error while listing factions ${e}`);
        }
    }
}