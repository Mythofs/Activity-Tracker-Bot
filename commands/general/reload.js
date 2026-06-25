const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder().setName('reload').setDescription('Reloads a command.')
        .addStringOption((option) => option.setName('command').setDescription('The command to reload.').setRequired(true)),
    async execute(interaction) {
        const commandName = interaction.options.getString('command', true).toLowerCase();
        const command = interaction.client.commands.get(commandName);
        if(!command) {
            return interaction.reply(`There is no command with name \`${commandName}\`!`);
        }

        const commandsBasePath = path.join(__dirname, '..');
        const folders = fs.readdirSync(commandsBasePath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        let commandPath = null;
        for (const folder of folders) {
            const filePath = path.join(commandsBasePath, folder, `${commandName}.js`);
            if (fs.existsSync(filePath)) {
                commandPath = filePath;
                break;
            }
        }
        if (!commandPath)
            return interaction.reply(`Could not find the file for command \`${commandName}\`!`);

        delete require.cache[require.resolve(commandPath)];
        try {
            const newCommand = require(commandPath);
            interaction.client.commands.set(newCommand.data.name, newCommand);
            return interaction.reply(`Command \`${commandName}\` was reloaded!`);
        }
        catch (error) {
            console.error(error);
            return interaction.reply(`There was an error while reloading \`${commandName}\`:\n\`${error.message}\``);
        }
    }
}