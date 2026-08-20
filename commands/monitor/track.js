const { SlashCommandBuilder } = require('discord.js');
const { AsciiTable3 } = require("ascii-table3")
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
                const facs = await queryRetry("SELECT id, name FROM faction_activity");
                const facNames = new Map(facs.map(fac => [fac.id, fac.name]));
                const monitoring = await queryRetry("SELECT * FROM monitor_store");
                const monitorStore = new Map(monitoring.map(monitor => [monitor.id, monitor.name]));
                const table = new AsciiTable3("ACTIVITY STORED").setStyle("unicode-single").setHeading("FACTION", "DATA POINTS", "TRACKED").setAlignCenter(3);
                for(const [id, name] of facNames) {
                    const data = await queryRetry("SELECT 1 FROM faction_activity WHERE id = ?", [id]);
                    const row = [name + " (" + id + ")", data.length];
                    if(monitorStore.has(id)) {
                        row.push("Yes");
                        monitorStore.delete(id);
                    }
                    else
                        row.push("No");
                    table.addRowMatrix([row]);
                }
                for(const [id, name] of monitorStore)
                    table.addRowMatrix([[name + " (" + id + ")", 0, "Yes"]]);
                return await interaction.editReply("```\n" + table.toString() + "\n```");
            }
            const monitor = await queryRetry("SELECT * FROM monitor_store WHERE id = ?", [facId]);
            if(monitor.length > 0) {
                await queryRetry("DELETE FROM monitor_store WHERE id = ?", [facId]);
                return await interaction.editReply(`Stopped tracking ${monitor[0].name + " (" + monitor[0].id + ")"}`);
            }
            else {
                const facData = await safeFetch(`https://api.torn.com/faction/${facId}?selections=basic&key=${process.env.API_KEY}&comment=ActivityTracker`);
                if("error" in facData)
                    return interaction.editReply(`No faction ${facId} found`);
                await queryRetry("INSERT INTO monitor_store (id, name) VALUES (?, ?)", [facId, facData.name]);
                return interaction.editReply(`Started tracking ${facData.name + " (" + facId + ")"}`);
            }
        }
        catch(e) { console.log(e); return interaction.editReply(`Error while starting tracking ${e}`); }
    },
}