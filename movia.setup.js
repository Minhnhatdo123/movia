import { Movia } from "./movia.js";

export const modals = {
    movia1: new Movia({
        templateId: "movia-1" , 
        closeMethods: ['button','escape','overlay'], // 3 cách đóng movia 
        destroyOnClose : false, 
        // false : close(false),close() thì không gỡ khỏi DOM
        // true : close(true),destroy() thì gỡ khỏi DOM
        // Không truyền destroyOnClose: Kiểm soát movia có thanh cuộn thì không gỡ khỏi DOM
        cssClass: ['movia-large' , 'movia-small'],// Thay đổi cssClass theo từng yêu cầu
        onReady: () => {
            console.log("movia 1 is ready");
        },
        onOpen: () =>{
            console.log("movia 1 opened")
        } ,
        onClose: () =>{
            console.log("movia 1 Closed")
        },
        footer:true, // chân trang
    }),

    movia2: new Movia({
        templateId: "movia-2" , 
        closeMethods: ['button','escape','overlay'], // 3 cách đóng movia 
        destroyOnClose : false, 
        // false : close(false),close() thì không gỡ khỏi DOM
        // true : close(true),destroy() thì gỡ khỏi DOM
        // Không truyền destroyOnClose: Kiểm soát movia có thanh cuộn thì không gỡ khỏi DOM
        cssClass: ['movia-large' , 'movia-small'],// Thay đổi cssClass theo từng yêu cầu
        onReady: () => {
            console.log("movia 2 is ready");
        },
        onOpen: () =>{
            console.log("movia 2 opened")
        } ,
        onClose: () =>{
            console.log("movia 2 Closed")
        },
        footer:true, // chân trang
    }),

    movia3: new Movia({
        templateId: "movia-3" , 
        closeMethods: ['escape','overlay'], // 3 cách đóng movia 
        destroyOnClose : false,
        // false : close(false),close() thì không gỡ khỏi DOM
        // true : close(true),destroy() thì gỡ khỏi DOM
        //       : Kiểm soát movia có thanh cuộn thì không gỡ khỏi DOM
        cssClass: ['movia-large' , 'movia-small'],// Thay đổi cssClass theo từng yêu cầu
        onOpen: () =>{
            console.log("Movia 3 opened")
        } ,
        onClose: () =>{
            console.log("Movia 3 Closed")
        },
        footer: true, // Chân trang

    }),
}


