import { register as registerRollToCastSpells } from './metal-rolltocastspells.js'
import { register as registerStressCounter } from './metal-stress.js'
import { register as registerAccursedClass } from './metal-accursed.js'
import { register as registerMaledictionSystem } from './metal-maledictions.js'
 
Hooks.on('init', async () => {

    // CONFIG.debug.hooks = true;
    CONFIG.CUSTOM_RULES = deepClone(CONFIG.DND5E)

    console.log(`
 \   |        |           |       _ \          |             
 |\/ |   _ \  __|    ' |  |      |   |  |   |  |   _ \   __| 
 |   |   __/  |    (   |  |      __ <   |   |  |   __/ \__ \ 
_|  _| \___| \__| \__,_| _|     _| \_\ \__,_| _| \___| ____/ 
   `
   );

   console.log("metal-rules | initializing");
                                                                   
   registerRollToCastSpells()
   registerStressCounter()
   registerStressCounter()
   registerAccursedClass()

})