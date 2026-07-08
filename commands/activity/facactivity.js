const { SlashCommandBuilder } = require('discord.js');
const QuickChart = require('quickchart-js');
const db = require('../../db.js');

module.exports = { 
    data: new SlashCommandBuilder().setName('facactivity').setDescription('Provides activity for specified faction(s)')
        .addIntegerOption((option) => option.setName("id").setDescription("The faction id").setRequired(true))
        .addIntegerOption((option) => option.setName("oppid").setDescription("The faction id to compare")),
    async execute(interaction) {
        try {
            const id = interaction.options.getInteger("id", true);
            const oppid = interaction.options.getInteger("oppid");
            const channel = interaction.client.channels.cache.get(process.env.CHANNEL_ID);
            const [name] = await db.execute('SELECT name FROM faction_name WHERE id = ?', [id]);
            if(name.length == 0)
                return await interaction.reply(`No faction ${id} found`);
            const chart = new QuickChart();
            const [activityData] = await db.execute('SELECT timestamp, numactive FROM faction_activity WHERE id = ?', [id]);
            const data = {
                labels: activityData.map(data => new Date(data.timestamp).toLocaleString()),
                datasets: [
                {
                    label: name[0].name,
                    data: activityData.map(data => data.numactive),
                    borderColor: 'rgb(255, 0, 0)',
                    fill: false
                }]
            }
            if(oppid != null) {
                const [oppname] = await db.execute("SELECT name FROM faction_name WHERE id = ?", [oppid]);
                if(oppname.length == 0)
                    return await interaction.reply(`No faction with ${oppid} found`);
                const [oppActivityData] = await db.execute("SELECT timestamp, numactive FROM faction_activity WHERE id = ?", [oppid]);
                let index = 0;
                for(const oppdata in oppActivityData)
                    if(Math.abs(oppActivityData[oppdata].timestamp % 86400 - activityData[0].timestamp % 86400) < 300) {
                        index = oppdata;
                        break;
                    }
                const adjustedOppData = [ ...oppActivityData.slice(index),...oppActivityData.slice(0, index)];
                data.dataset.push({
                    label: oppname[0].name,
                    data: adjustedOppData.map(data => data.numactive),
                    borderColor: "rgb(0,0,255)",
                    fill: false
                })
            }
            chart.setConfig({
                type: 'line',
                data: data,
                options: {
                    scales: {
                        yAxes: [{
                          ticks: {
                            min: 0,
                            max: 100
                          }
                        }]
                    }
                }
            });
            chart.setWidth(800);
            chart.setHeight(600);
            const buffer = await chart.toBinary();
            return interaction.reply({files: [{attachment: buffer, name: 'activityGraph.png'}]});
        }
        catch(e) {
            console.log(`Error while sending activity graph ${e}`);
            return interaction.reply(`Error while sending activity graph ${e}`);
        }
    },
};