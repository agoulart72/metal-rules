import { libWrapper } from "../lib/shim.js";

export const moduleName = "metal-rules";

export function register() {

    game.settings.register(moduleName, "initDice", {
        name: "Die to use for initiative",
        hint: "",
        scope: "world",
        config: true,
        type: String,
        choices: {
            d20: "d20",
            d12: "d12",
            d10: "d10",
            d8: "d8",
            d6: "d6",
        },
        default: "d20"
    });

    Hooks.on("dnd5e.preRollInitiative", metalInitiative2)    

    // Hooks.once("setup", () => {

    //     // Replace roll initiative button with custom initiative
    //     libWrapper.register(moduleName, "Combatant.prototype._getInitiativeFormula", metalInitiative, "OVERRIDE");
    
    // });    
}


async function metalInitiative2(actor, config) {
    console.log("metal-rules: pre init")
    console.log("Actor : ", actor)
    console.log("Config :", config)

    let defaultDie = game.settings.get(moduleName, "initDice")

    const rollConfig = {
        formula: '1' + defaultDie,
        data: {},
        chatMessage: true
    }

    const roll = new Roll(rollConfig.formula, config.data);

    config.terms[0] = roll

    return true
}

function metalInitiative() {

    const actor = this.actor;
    let defaultDie = game.settings.get(moduleName, "initDice")
    if ( !actor ) return "1" + defaultDie;
    const actorData = actor.data.data;
    const init = actorData.attributes.init;
    const rollData = actor.getRollData();

    // Construct initiative formula parts
    let nd = 1;
    let mods = "";
    if (actor.getFlag("dnd5e", "halflingLucky")) mods += "r1=1";
    if (actor.getFlag("dnd5e", "initiativeAdv")) {
        nd = 2;
        mods += "kh";
    }
    const parts = [
        `${nd}${defaultDie}${mods}`,
        init.mod,
        (init.prof.term !== "0") ? init.prof.term : null,
        (init.bonus !== 0) ? init.bonus : null
    ];

    // Ability Check Bonuses
    const dexCheckBonus = actorData.abilities.dex.bonuses?.check;
    const globalCheckBonus = actorData.bonuses?.abilities?.check;
    if ( dexCheckBonus ) parts.push(Roll.replaceFormulaData(dexCheckBonus, rollData));
    if ( globalCheckBonus ) parts.push(Roll.replaceFormulaData(globalCheckBonus, rollData));

    // Optionally apply Dexterity tiebreaker
    const tiebreaker = game.settings.get("dnd5e", "initiativeDexTiebreaker");
    if ( tiebreaker ) parts.push(actor.data.data.abilities.dex.value / 100);
    return parts.filter(p => p !== null).join(" + ");
};
