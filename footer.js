export function initFooter(modal){
   modal.setFooterContent("<p>This is the footer content</p>");

   modal.addFooterButton({
        id: "btn-cancel",
        label: "Cancel",
        classNames: "button btn-cancel",
        onClick() { this.close(); }
    });

    modal.addFooterButton({
        id: "btn-confirm",
        label: "Save changes",
        classNames: "button btn-confirm",
        onClick() {
            console.log("Saved!");
            this.close();
        }
    });

    
}