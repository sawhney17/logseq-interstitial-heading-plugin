import '@logseq/libs';
import SettingSchemaDesc from '@logseq/libs/dist/LSPlugin.user';

var simple = true;

const settingsTemplate:SettingSchemaDesc[] = [{
    key: "defaultTitle",
    type: 'boolean',
    default: false,
    title: "Insert Header by default?",
    description: "If true, \"<mod> t\" will insert a header, otherwise only the time",
   },{
    key: "level",
    type: 'number',
    default: 3,
    title: "Title level?",
    description: "Insert timestamped heading level, default to 3 (### HH:MM title)",
    }
]
logseq.useSettingsSchema(settingsTemplate)

async function updateBlock(block,simple) {
    let content = /^#{1,6}\s+/.test(block.content)
        ? block.content.replace(/^#{1,6}\s+/, '')
        : block.content;
    var today = new Date();
    let time = today.getHours() + ":" + String(today.getMinutes()).padStart(2, '0')
    let timestamp = simple ? ' ' + time + ' ' : '**' + time + '** '
    let header = simple ? '#'.repeat(logseq.settings.level) : ''
    await logseq.Editor.updateBlock(
            block.uuid,
            header + timestamp + content
            );
}

async function insertInterstitional(simple) {
  const selected = await logseq.Editor.getSelectedBlocks();
  if (selected && selected.length > 1) {
    for (let block of selected) {
        updateBlock(block, simple)
         }
  } else {
    const block = await logseq.Editor.getCurrentBlock();
    if (block?.uuid) {
        updateBlock(block, simple)
    }
  }
}

function journalDate() {
  //hardcoded yesterday
  let date = (function(d){ d.setDate(d.getDate()-1); return d})(new Date)
  return parseInt(`${date.getFullYear()}${("0" + (date.getMonth()+1)).slice(-2)}${("0" + date.getDate()).slice(-2)}`,10)
}

async function parseQuery(randomQuery,queryTag){
  // https://stackoverflow.com/questions/19156148/i-want-to-remove-double-quotes-from-a-string
  let query = `[:find (pull ?b [*])
  :where
  [?b :block/path-refs [:block/name "${queryTag.toLowerCase().trim().replace(/^["'](.+(?=["']$))["']$/, '$1')}"]]]`
  if ( randomQuery == "yesterday" ) {
    query = `[:find (pull ?b [*])
    :where
    [?b :block/path-refs [:block/name "${queryTag.toLowerCase().trim().replace(/^["'](.+(?=["']$))["']$/, '$1')}"]]
    [?b :block/page ?p]
    [?p :block/journal? true]
    [?p :block/journal-day ${journalDate()}]]`
  }
  try { 
    let results = await logseq.DB.datascriptQuery(query) 
    //Let this be, it won't hurt even if there's only one hit
    let flattenedResults = results.map((mappedQuery) => ({
      uuid: mappedQuery[0].uuid['$uuid$'],
    }))
    let index = Math.floor(Math.random()*flattenedResults.length)
    const origBlock = await logseq.Editor.getBlock(flattenedResults[index].uuid, {
      includeChildren: true,
    });
    return `((${flattenedResults[index].uuid}))`
  } catch (error) {return false}
}

async function isTemplate(block){
  if (block.properties) {
    if (block.properties.template != undefined) return true
    }
  return false
}

async function hasParent(block) {
  if (block.parent != null && block.parent.id !== block.page.id) return true
  return false
}

async function getBlock(uuid) {
  const block = await logseq.Editor.getBlock(uuid)
  return block  
}

async function checkBlock(uuid){
  try {
    let block = await getBlock(uuid)
    let checkTPL = await isTemplate(block)
    let checkPRT = await hasParent(block)

    if (checkTPL === false && checkPRT === false) return false
    if (checkTPL === true )                       return true 
    return await checkBlock(block.parent.id) 

  } catch (error) { console.log(error) }
}

const main = async () => {

    logseq.App.onMacroRendererSlotted(async ({ slot, payload }) => {
      try {
        var [type, randomQ , tagQ ] = payload.arguments
        if (type !== ':interstitial') return
  
        //is the block on a template?
        const templYN = await checkBlock(payload.uuid)        
        const block = await parseQuery( randomQ, tagQ)
        // parseQuery returns false if no block can be found
        const msg = block ? `<span style="color: green">{{renderer ${payload.arguments} }}</span> (will run with template)` : `<span style="color: red">{{renderer ${payload.arguments} }}</span> (wrong tag?)`

        if (templYN === true || block === false) { 
            await logseq.provideUI({
            key: "interstitial",
            slot,
            template: `${msg}`,
            reset: true,
            style: { flex: 1 },
          })
          return 
        }
        else { await logseq.Editor.updateBlock(payload.uuid, block ) }  
      } catch (error) { console.log(error) }
    })

    logseq.App.registerCommandPalette(
      {
        key: `interstial-time-stamp`,
        label: `Insert interstitial line`,
        keybinding: {
          mode: 'global',
          binding: 'mod+t',
        },
      },
      async () => {
        await insertInterstitional(logseq.settings.defaultTitle ? true : false);
      }
    );

    logseq.App.registerCommandPalette(
      {
        key: `interstial-time-stamp-h`,
        label: `Insert interstitial heading`,
        keybinding: {
          mode: 'global',
          binding: 'mod+shift+t',
        },
      },
      async () => {
        await insertInterstitional(logseq.settings.defaultTitle ? false : true);
      }
    );
}

logseq.ready(main).catch(console.error);
