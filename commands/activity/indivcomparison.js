const { SlashCommandBuilder } = require('discord.js');
const { AsciiTable3 } = require("ascii-table3")
const QuickChart = require("quickchart-js");
const queryRetry = require("../../queryRetry.js");
const safeFetch = require("../../safeFetch.js");

module.exports = { 
    data: new SlashCommandBuilder().setName('indivcomparison').setDescription('Provides activity for specified player(s)')
        .addIntegerOption((option) => option.setName("id").setDescription("The player id").setRequired(true))
        .addIntegerOption((option) => option.setName("oppid").setDescription("The player id to compare")),
    async execute(interaction) {
        await interaction.deferReply();
        const channel = interaction.client.channels.cache.get(process.env.CHANNEL_ID);
        try {
            const id = interaction.options.getInteger("id", true);
            const oppid = interaction.options.getInteger("oppid");
            const activityData = await queryRetry("SELECT name, timestamp, active FROM individual_activity WHERE id = ?", [id]);
            if(activityData.length == 0)
                return await interaction.editReply(`No player ${id} found`);
            let myBs;
            const stats = await safeFetch(`https://www.tornstats.com/api/v2/${process.env.TORNSTATS_KEY}/spy/user/${id}`);
            if(stats.status) {
                if(stats.spy.timestamp > Math.floor(Date.now() / 1000) - 604800)
                    myBs = stats.spy.total;
                else {
                    const ffsStats = await safeFetch(`https://ffscouter.com/api/v1/get-stats?key=${process.env.FFSCOUTER_KEY}&targets=${id}`);
                    myBs = Math.max(stats.spy.total, ffsStats.bs_estimate);
                }
            }
            else
                return interaction.editReply("Error fetching bs for " + id);
            let sum = 0;
            activityData.forEach(data => sum += data.active);
            const name = activityData[0].name + " (" + id + ")";
            const table = new AsciiTable3("INDIVIDUAL COMPARISON").setStyle("unicode-single").setHeading("STAT", activityData[0].name.toUpperCase()).setAlignRight(2).setAlignRight(3);
            let rowMatrix = [
                ["Id", id],
                ["Total battlestats", myBs.toLocaleString()],
                ["Activity Percentage", (sum / activityData.length * 100).toFixed(2) + "%"],
            ];
            let data;
            if(oppid) {
                const oppActivityData = await queryRetry("SELECT name, timestamp, active FROM individual_activity WHERE id = ?", [oppid]);
                if(oppActivityData.length == 0)
                    return await interaction.editReply(`No faction ${oppid} found`);
                const oppname = oppActivityData[0].name + " (" + oppid + ")";
                data = {
                    datasets: [
                    {
                        label: name,
                        data: activityData.map(data => ({"x": data.timestamp, "y": data.active})),
                        borderColor: "rgb(255, 0, 0)",
                        backgroundColor: "rgb(255, 0, 0)",
                        fill: false
                    },
                    {
                        label: oppname,
                        data: oppActivityData.map(data => ({"x": data.timestamp, "y": data.active})),
                        borderColor: "rgb(0, 0, 255)",
                        backgroundColor: "rgb(0, 0, 255)",
                        fill: false
                    }]
                }
                let oppBs;
                const stats = await safeFetch(`https://www.tornstats.com/api/v2/${process.env.TORNSTATS_KEY}/spy/user/${oppid}`);
                if(stats.status) {
                    if(stats.spy.timestamp > Math.floor(Date.now() / 1000) - 604800)
                        oppBs = stats.spy.total;
                    else {
                        const ffsStats = await safeFetch(`https://ffscouter.com/api/v1/get-stats?key=${process.env.FFSCOUTER_KEY}&targets=${oppid}`);
                        oppBs = Math.max(stats.spy.total, ffsStats.bs_estimate);
                    }
                }
                else
                    return interaction.editReply("Error fetching bs for " + oppid);
                let oppsum = 0;
                oppActivityData.forEach(data => oppsum += data.active);
                table.setHeading("STAT", activityData[0].name.toUpperCase(), oppActivityData[0].name.toUpperCase())
                rowMatrix = [
                    ["Id", id, oppid],
                    ["Total battlestats", myBs.toLocaleString(), oppBs.toLocaleString()],
                    ["Activity Percentage", (sum / activityData.length * 100).toFixed(2) + "%", (oppsum / oppActivityData.length * 100).toFixed(2) + "%"],
                ];
            }
            else {
                data = {
                    datasets: [
                    {
                        label: name,
                        data: activityData.map(data => ({"x": data.timestamp, "y": data.active})),
                        borderColor: "rgb(255, 0, 0)",
                        backgroundColor: "rgb(255, 0, 0)",
                        fill: false
                    }]
                }
            }
            const chart = new QuickChart().setVersion("3");
            chart.setConfig({
                type: 'line',
                data: data,
                options: {
                    scales: {
                        x: {
                            type: "time",
                            title: {
                                display: true,
                                text: "Time"
                            }
                        },
                        y: {
                            min: 0,
                            max: 1,
                            title: {
                                display: true,
                                text: "Active"
                            }
                        }
                    }
                }
            });
            chart.setWidth(800);
            chart.setHeight(600);
            const buffer = await chart.toBinary();
            table.addRowMatrix(rowMatrix);
            return interaction.editReply({content: "```\n" + table.toString() + "\n```", files: [{attachment: buffer, name: "activityGraph.png"}]});
        }
        catch(e) {
            console.log(`Error while sending activity graph ${e}`);
            return interaction.editReply(`Error while sending activity graph ${e}`);
        }
    },
};