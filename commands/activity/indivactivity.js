const { SlashCommandBuilder } = require('discord.js');
const QuickChart = require("quickchart-js");
const db = require("../../db.js");

module.exports = { 
    data: new SlashCommandBuilder().setName('indivactivity').setDescription('Provides activity for specified player(s)')
        .addIntegerOption((option) => option.setName("id").setDescription("The player id").setRequired(true))
        .addIntegerOption((option) => option.setName("oppid").setDescription("The player id to compare")),
    async execute(interaction) {
        const channel = interaction.client.channels.cache.get(process.env.CHANNEL_ID);
        try {
            const id = interaction.options.getInteger("id", true);
            const oppid = interaction.options.getInteger("oppid");
            const [name] = await db.execute('SELECT name FROM individual_name WHERE id = ?', [id]);
            if(name.length == 0)
                return interaction.reply(`No player ${id} found`);
            const chart = new QuickChart();
            const [labels] = await db.execute('SELECT timestamp FROM individual_activity WHERE id = ?', [id]);
            const [activityData] = await db.execute('SELECT active FROM individual_activity WHERE id = ?', [id]);
            const data = {
                labels: labels.map(label => new Date(label.timestamp).toLocaleString()),
                datasets: [
                {
                    label: name[0].name,
                    data: activityData.map(data => data.active),
                    borderColor: 'rgb(255, 0, 0)',
                    fill: false
                }]
            }
            if(oppid != null) {
                const [oppname] = await db.execute("SELECT name FROM individual_name WHERE id = ?", [oppid]);
                if(oppname.length == 0)
                    return await interaction.reply(`No player ${oppid} found`);
                const [oppActivityData] = await db.execute("SELECT timestamp, active FROM individual_name WHERE id = ?", [oppid]);
                let index = 0;
                for(const oppdata in oppActivityData)
                    if(Math.abs(oppActivityData[oppdata].timestamp % 86400 - activityData[0].timestamp % 86400) < 300) {
                        index = oppdata;
                        break;
                    }
                const adjustedOppData = [ ...oppActivityData.slice(index),...oppActivityData.slice(0, index)];
                data.dataset.push({
                    label: oppname[0].name,
                    data: adjustedOppData.map(data => data.active),
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
                            max: 1
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
            channel.send(`Error while sending activity graph ${e}`);
            return interaction.reply(`Error while sending activity graph ${e}`);
        }
    },
};