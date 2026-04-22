import {moviaRegistry} from "./movia.js";
import {modals}  from "./movia.setup.js";
import {initLogin} from "./login.js";
import {initFooter} from "./footer.js";

document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-open-movia]");
    if (!btn) return;

    const id = btn.dataset.openMovia;
    const movia = moviaRegistry.get(id);
    if (!movia) {
        console.warn(`No movia found with id ${id}`);
        return;}
    movia.open();
});

initLogin(modals.movia2);
initFooter(modals.movia3);
