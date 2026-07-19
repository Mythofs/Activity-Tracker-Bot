const { SlashCommandBuilder } = require('discord.js');
const safeFetch = require("../../safeFetch.js");
const queryRetry = require("../../queryRetry.js");

module.exports = {
    data: new SlashCommandBuilder().setName("track").setDescription("Starts tracking a faction's activity")
        .addStringOption((option) => option.setName("id").setDescription("The faction to track").setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const channel = interaction.client.channels.cache.get(process.env.CHANNEL_ID);
        try {
            const facId = interaction.options.getString("id");
            if(!facId) {
                let str = "";
                const facs = await queryRetry("SELECT id, name FROM faction_activity");
                const facNames = new Map(facs.map(fac => [fac.id, fac.name]));
                const monitoring = await queryRetry("SELECT id FROM monitor_store");
                const monitorStore = monitoring.map(monitor => monitor.id);
                for(const [id, name] of facNames) {
                    const data = await queryRetry("SELECT 1 FROM faction_activity WHERE id = ?", [id]);
                    str += `\n${name} (${id}), ${data.length} data points`;
                    if(monitorStore.includes(id))
                        str += ", currently being tracked";
                }
                if(str.length == 0)
                    return await interaction.editReply("No faction activity stored");
                return await interaction.editReply(str);
            }
            const monitor = await queryRetry("SELECT * FROM monitor_store WHERE id = ?", [facId]);
            if(monitor.length > 0) {
                await queryRetry("DELETE FROM monitor_store WHERE id = ?", [facId]);
                return await interaction.editReply(`Stopped tracking ${facId}`);
            }
            else {
                const facData = await safeFetch(`https://api.torn.com/faction/${facId}?selections=basic&key=${process.env.API_KEY}`, channel);
                if("error" in facData)
                    return interaction.editReply(`No faction ${facId} found`);
                await queryRetry("DELETE FROM faction_activity WHERE id = ?", [facId]);
                await queryRetry("DELETE FROM individual_activity WHERE facid = ?", [facId]);
                await queryRetry("INSERT INTO monitor_store (id) VALUES (?)", [facId]);
                return interaction.editReply(`Started tracking ${facId}`);
            }
        }
        catch(e) { return interaction.editReply(`Error while starting tracking ${e}`); }
    },
}