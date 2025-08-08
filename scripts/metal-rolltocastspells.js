import { libWrapper } from "../lib/shim.js";

export const moduleName = "metal-rules";

export function register() {
    console.log("metal-rules : registering roll to cast")

    Hooks.once("ready", async () => {
        const midiQolModule = game.modules.get('midi-qol');
    
        if (midiQolModule?.active) {
            try {
                Hooks.on("midi-qol.preItemRoll", midiQolHook);
            } catch (error) {
                console.error(`Error importing class from mid-qol module: ${error.message}`);
            }          
        } else {
            Hooks.on("dnd5e.preUseItem", metalRollToCastSpells);
        }
    
    });    
}


async function midiQolHook(workflow) {
    console.log("### midiQolHook ")

    if (workflow?.item?.type === "spell") {
        console.log("### workflow: ", workflow)
        return await metalRollToCastSpells(workflow.item, workflow.config, workflow.options)
    }

    return true
}


const rollToCastSpellDC = {
    "spell1" : 12, 1: 12,
    "spell2" : 13, 2: 13,
    "spell3" : 15, 3: 15,
    "spell4" : 16, 4: 16,
    "spell5" : 17, 5: 17,
    "spell6" : 19, 6: 19,
    "spell7" : 20, 7: 20,
    "spell8" : 21, 8: 21,
    "spell9" : 23, 9: 23,
}

async function metalRollToCastSpells(item, config, options) {

    // midi-qol.preTargeting
    // dnd5e.preUseItem
    console.log("### dnd5e.preUseItem HOOK")
    console.log("### item: ", item)
    console.log("### config: ", config)
    console.log("### options: ", options)

    if ( item.type === "spell" ) {
        console.log("### Will cast a spell : ", item.getRollData());

        const spellDC = rollToCastSpellDC[item.system.level]
        const rollData = item.getRollData()
        const spellcastingAbilityModifier = rollData.attributes.spellmod + rollData.attributes.prof

        const rollConfig = {
            formula: '1d20 + @mod' ,
            data: { mod: spellcastingAbilityModifier, item: item },
            chatMessage: true
        }
        rollConfig.data.item.level = item.system.level;

        const roll = new Roll(rollConfig.formula, rollConfig.data);
        
        await roll.evaluate();

        // Display the dice roll in the chat with a nice animation
        if (game.dice3d?.isEnabled()) {
            await game.dice3d.showForRoll(roll, game.user, true, null, false);
        } else {
            await roll.toMessage({
                user: game.user.id,
                speaker: ChatMessage.getSpeaker({ item }),
                flavor: `Casting check for ${item.name}`
            });
        }
        
        console.log(`Spellcasting Modifier: ${spellcastingAbilityModifier}`);
        console.log(`Roll Result: ${roll.total}`);        

        var succesOrFailMessage = "Spell Succesfully Cast"
        if (roll.total < spellDC) {
            succesOrFailMessage = "The spell fizzles"
        }

        // Display the roll result in the chat
        ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ item }),
            content: `<div><b>Spell DC:</b> ${spellDC} <br/><b>Casting Roll Result:</b> ${roll.total} <br/>${succesOrFailMessage} </div>`
        });

        if (roll.total < spellDC) {
            console.log(`Spellfailed: ${roll.total} < ${spellDC}`);  
            return false
        }
    }

    return true
}