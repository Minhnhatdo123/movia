export const moviaRegistry = new Map(); // Quản lý các instance Movia

const moviaStack = []; // stack Movia hỗ trợ nested Movia
function _getTopMovia() // Movia trên cùng (dang mở)
{
    return moviaStack.length ? moviaStack[moviaStack.length - 1] : null;
}

let SCROLLBAR_WIDTH = null;
let ORIGINAL_BODY_PADDING_RIGHT = null;

function getScrollBarWidth()
{
    if(SCROLLBAR_WIDTH !== null) return SCROLLBAR_WIDTH;

    const div = document.createElement("div");
    Object.assign(div.style,{
        overflow:"scroll",
        visibility:"hidden",
        position:"absolute",
        top:"0",
        left:"0",
        width:"50px",
        height:"50px"
    })
    document.body.appendChild(div);
    SCROLLBAR_WIDTH = div.offsetWidth - div.clientWidth;
    document.body.removeChild(div);
    return SCROLLBAR_WIDTH;
}


export class Movia{
    static defaults = {
        closeMethods : ['button', 'overlay','escape'], // Các phương thức đóng mặc định
        cssClass : [], // Lớp CSS mặc định
        destroyOnClose:false,
        autoSanitize: true, // cờ flag tự động làm sạch dữ liệu
    }
    static configure(config = {})
    {
        Object.assign(Movia.defaults , config);
    }

    constructor(config = {})
    {   
        const defaults = {
            templateId: null,
            content : "",
            footer:false,
            onReady: null,
            onOpen: null,
            onClose: null,

            closeMethods :[...Movia.defaults.closeMethods],
            cssClass :[...Movia.defaults.cssClass],
            destroyOnClose : Movia.defaults.destroyOnClose,
            autoSanitize : Movia.defaults.autoSanitize,
            
        }

        Object.assign(this,defaults,config);

        if(!this.templateId){
            console.warn("Movia requires templateId");
        }

        this.id = this.templateId;
        if(moviaRegistry.has(this.id))
        {
            throw new Error(`Duplicate movia id ${this.id}`);
        }
        moviaRegistry.set(this.id, this);

        this._pendingContent = []; // Nội dung chờ cập nhật khi movia chưa mở
        this.contentElement = null; // DOM chứa content chính của Movia

        // State quản lý nội dung động và button chân trang của footer
        this._footerButtons = []; // state (nguồn dữ liệu thật)
        this._pendingFooterButtons = []; // addFooterButton() trước khi mở Movia → lưu tạm ở đây
        // 
        this._footerContent = ""; // state nội dung chân trang thật
        this._pendingFooterContent = null; // Nội dung chân trang có thể thêm
        
        this._footerContentEl = null; // DOM chứa content của footer
        this._footerButtonsEl = null; // DOM chứa button của footer
        this.footerElement = null; // Root DOM của footer (chứa cả content và button)

        // Runtime state
        this.isOpen = false;
        this.backdrop = null;
        this._isDestroyed = false; // flag đã bị destroy
    
        // Internal(nội bộ)
        this._handlers = new Map(); // Lưu trữ các handler sự kiện
        this._keydownHandler = null;
        this._eventsBound = false; // Bind event hay chưa
    }

    createMovia()
    {
        if(this.backdrop) return this.backdrop;
        const backdrop = this._createBackdrop();
        const container = this._createContainer();
        container.append(this._createContent());

        if(this.footer)
        {
            container.append(this._createFooter());
        }
 
        backdrop.append(container);
        this.backdrop = backdrop;
        return backdrop;
    }

    _createBackdrop()
    {
        const backdrop = document.createElement("div");
        backdrop.className = "movia-backdrop";
        backdrop.dataset.moviaId = this.templateId || "";
        return backdrop;
    }
    
    _createContainer()
    {
        const container = document.createElement("div");
        container.className = "movia-container";
        
        if(Array.isArray(this.cssClass))
        {
            this.cssClass.filter(cls => typeof cls === "string" && cls.trim())
            .forEach(cls => container.classList.add(cls));
        }

        if(this.closeMethods.includes('button'))
        {
            container.appendChild(
                this._createButton({
                     label: `
                            <svg width="16" height="16" viewBox="0 0 24 24">
                                <path d="M6 6L18 18M6 18L18 6"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"/>
                            </svg>
                        `,
                    classNames:"movia-close",
                    onClick:this.close.bind(this),
                    })
            )
        }
        return container;
        
    }  

    _createContent()
    {
        const moviaContent = document.createElement("div");
        moviaContent.className = "movia-content";

        this.contentElement = moviaContent;

        const template = this.templateId && document.getElementById(this.templateId);
        if(template?.content){
            moviaContent.appendChild(template.content.cloneNode(true));
        } else {
            moviaContent.innerHTML = this._sanitizeHTML(this.content ?? "");
        }
        return moviaContent;
    }

    _createFooter()
    {
        const moviaFooter = document.createElement("div");
        moviaFooter.className = "movia-footer";

        // content container
        const contentFooter = document.createElement("div");
        contentFooter.className = "movia-footer-content";

        const btnsFooter = document.createElement("div");
        btnsFooter.className = "movia-footer-buttons";

        moviaFooter.appendChild(contentFooter);
        moviaFooter.appendChild(btnsFooter);
        
        // Lưu reference DOM để cập nhật sau này
        this.footerElement = moviaFooter;
        this._footerContentEl = contentFooter;
        this._footerButtonsEl = btnsFooter;

        if(this._footerContent){
            contentFooter.innerHTML = this._footerContent;
        }

        this._footerButtons.forEach(btnConfig => {
            btnsFooter.appendChild(this._createButton(btnConfig));
        });

        return moviaFooter
    }


    _bindCoreEvents(backdrop)
    {
        if(this._eventsBound) return;

        if(this.closeMethods.includes("overlay"))
        {
            if(!this.overlayHandler)
            {
                this.overlayHandler = (e) =>{
                    if(e.target === backdrop) this.close();
                }
            }
            backdrop.addEventListener("click",this.overlayHandler);
        }

        if(this.closeMethods.includes("escape"))
        {
            if(!this._keydownHandler)
            {
                this._keydownHandler = (e) => {
                    if(e.key === "Escape" && _getTopMovia() === this)
                    {
                        this.close();
                    }
                }
            }
            document.addEventListener("keydown",this._keydownHandler);
        }
        
        this._eventsBound = true;
    }
    
    // ----------- Mở --------------------------
    open()
    {
        if(this.isOpen) return;

        if(this._isDestroyed){
            console.warn("This Movia instance has been destroyed and cannot be opened.");
            return;
        }

        this.isOpen = true;
        moviaStack.push(this);

        this._mountDOM();
        this._flushPending();
        this._lockScroll();
        this._emitReady();
        this._emitOpen();
    }

    // Thêm element vào DOM
    _mountDOM()
    {
        let backdrop = this.backdrop;
        // Kiểm tra biến DOM của backdrop / tạo mới biến DOM
        // close() / destroy(false)  || close(true)/ destroy(true)
        if(!this.backdrop || !document.body.contains(this.backdrop))
        {
            backdrop = this.createMovia();
        }
        if(!this._eventsBound) {
            this._bindCoreEvents(backdrop); // Gán sự kiện :overlay, escape
        }
        this._bindChildEvents(backdrop); // Gán sự kiện mở Movia con
        if(!document.body.contains(backdrop)) document.body.append(backdrop);
        backdrop.style.visibility = ""; 
        backdrop.classList.add("show");
    }

    // Render state dữ liệu khi DOM sẵn sàng 
    _flushPending()
    {
        // ==== Main Content ====
        if(this._pendingContent?.length && this.contentElement)
        {
            this._pendingContent.forEach(({html,mode}) => {
                this._applyContent(html, mode);
            })
            this._pendingContent = [];
        }
        
        // ==== Footer Content ====
        if(this._pendingFooterContent !== null){
            this._footerContent = this._pendingFooterContent;
            this._pendingFooterContent = null;
            if(this._footerContentEl){
                this._footerContentEl.innerHTML = this._footerContent;
            }
        }

        // ==== Footer Buttons ====
        if(this._pendingFooterButtons.length){
            if(this._footerButtonsEl){
                this._pendingFooterButtons.forEach(btnConfig => {
                    const btn = this._createButton(btnConfig);
                    this._footerButtonsEl.appendChild(btn);
                    this._footerButtons.push(btnConfig);
                });
            } else {
                this._footerButtons.push(...this._pendingFooterButtons);
            }
            this._pendingFooterButtons = [];
        }
    }

    _lockScroll()
    {
        if(moviaStack.length !== 1) return;

        const sw = getScrollBarWidth();

        const computed = getComputedStyle(document.body).paddingRight;
        if(ORIGINAL_BODY_PADDING_RIGHT === null){
            ORIGINAL_BODY_PADDING_RIGHT = computed;
        }

        const current = parseFloat(computed) || 0;

        document.body.style.paddingRight = `${current + sw}px`;
        document.body.classList.add("no-scroll");
    }

    _safeCall(fn,...args)
    {
        if(typeof fn !== "function") return;
        try{
            fn.apply(this,args);
        } catch(err){
            console.error(err);
        }
    }

    // Phát tín hiệu sẵn sàng
    _emitReady()
    {
        //  chờ Browser render xong trước khi animation
        requestAnimationFrame(() => {
            if(!this.isOpen) return;
            // Phát sự kiện tùy chỉnh "movia:ready" trên backdrop để các thành phần con có thể lắng nghe và phản hồi khi Movia đã sẵn sàng
            this.backdrop?.dispatchEvent(new CustomEvent("movia:ready"));
            this._safeCall(this.onReady);
        })
    }
    
    // Khôi phục vị trí scroll bên trong Movia
    _restoreScroll(backdrop){
        if(typeof this._saveScroll !== "number") return;
        const el = backdrop?.querySelector(".movia-container");
        if(el) el.scrollTop = this._saveScroll;    
    }

    // Phát tín hiệu mở
    _emitOpen()
    {
        this._onTransitionEnd(this.backdrop,() => {
            if(!this.isOpen) return;
            this._restoreScroll(this.backdrop);
            this.backdrop?.dispatchEvent(new CustomEvent("movia:open"));
            this._safeCall(this.onOpen);
        })
    }

    // ---------- Đóng ---------
    close(forceDestroy = false){
        if(!this.isOpen || !this.backdrop) return;

        const index = moviaStack.indexOf(this);
        if(index !== -1) moviaStack.splice(index,1);
        
        this.isOpen = false;

        this._saveScrollPosition();
        this._unlockScroll();
        this._cleanDOM(forceDestroy);

    }

    // Lưu vị trí scroll bên trong Movia trước khi đóng
    _saveScrollPosition(){
        const el = this.backdrop?.querySelector(".movia-container");
        this._saveScroll = el?.scrollTop ?? 0;
    }

    // Phát tín hiệu đóng
    _unlockScroll()
    {
        if(moviaStack.length !== 0) return;

        document.body.classList.remove("no-scroll");

        if(ORIGINAL_BODY_PADDING_RIGHT !== null){
            document.body.style.paddingRight = ORIGINAL_BODY_PADDING_RIGHT;
            ORIGINAL_BODY_PADDING_RIGHT = null;
        } else {
            document.body.style.paddingRight = "";
        }
    }

    _removeEvents()
    {
        if(!this._eventsBound) return;

        if(this._keydownHandler){
            document.removeEventListener("keydown",this._keydownHandler);
        }
        
        if(this.backdrop && this.overlayHandler){
            this.backdrop.removeEventListener("click",this.overlayHandler);
        }
        
        this._keydownHandler = null;
        this.overlayHandler = null;

        if(this.backdrop)
        {
            this._unbindChildEvents(this.backdrop);
        }

        this._eventsBound = false;
    }

    _shouldDestroy(forceDestroy){
        return forceDestroy || Boolean(this.destroyOnClose);
    }


    _cleanDOM(forceDestroy)
    {
        if(!this.backdrop) return;
        const backdrop = this.backdrop;
        backdrop?.classList.remove("show");

        // Lắng nghe sự kiện kết thúc transition trước khi gỡ DOM
        const willDestroy = this._shouldDestroy(forceDestroy);

        this._onTransitionEnd(backdrop,() => {
            this._finallyDestroy(willDestroy);
        })
    }

    _finallyDestroy(willDestroy){
        if(!this.backdrop) return;
        const backdrop = this.backdrop;

        if(willDestroy)
        {
            this._removeEvents();
            this._handlers.forEach((handler,btn) => {
                btn.removeEventListener("click", handler);
            });
            this._handlers.clear();

            backdrop?.remove();
            this.backdrop = null;
            this.footerElement = null;
            this.contentElement = null;
            this._footerContentEl = null;
            this._footerButtonsEl = null;
        } else{
            backdrop.style.visibility = "hidden";
            this._removeEvents();
        }

        this._resetPendingStates(willDestroy);
        this._safeCall(this.onClose);
    }

    _resetPendingStates(forceDestroy) {
        if(!forceDestroy) return;
        this._footerButtons = [];
        this._pendingFooterButtons = [];
        this._pendingFooterContent = null;
        this._pendingContent       = [];
    }

    destroy()
    {
        if(this._isDestroyed) return;
        this._isDestroyed = true;
        moviaRegistry.delete(this.id);
        
        if(this.isOpen)
            {
                this.close(true);
            } else {
                this._removeEvents();
                this._finallyDestroy(true);
            }
    }

    // ------ Update Content Movia -----
    _cleanHandlersIn(container)
    {
        [...this._handlers.entries()].forEach(([btn, handler]) => {
            if(container.contains(btn))
            {
                btn.removeEventListener("click", handler);
                this._handlers.delete(btn);
            }
        })
    }

    _applyContent(html, mode)
    {
        if(!this.contentElement) return;

        switch(mode)
        {
            // Chèn vào bên trong , sau Child cuối cùng
            case "append":
                this.contentElement.insertAdjacentHTML("beforeend", html); 
                break;
            // Vào đầu bên trong, ngay trước Child đầu tiên
            case "prepend":
                this.contentElement.insertAdjacentHTML("afterbegin", html);
                break;
            case "replace":
                this._cleanHandlersIn(this.contentElement);
                this.contentElement.innerHTML = html;
                break;
        }
    }

    _sanitizeHTML(html)
    {
        if(!this.autoSanitize) return String(html ?? "");
        if(typeof DOMPurify === "undefined")
        {
            console.warn("DOMPurify is not available");
            return String(html ?? "");
        }
        return DOMPurify.sanitize(html);
    }   

    updateContent(html , mode = "replace")
    {
        const safeHtml = this._sanitizeHTML(html);

        if(!this._pendingContent){
            this._pendingContent = [];
        }

        if(mode === "replace")
        {
            this._pendingContent.length = 0; // Xóa nội dung chờ cũ
        }
        this._pendingContent.push({html: safeHtml, mode});
        
        // Nếu Movia đang mở và contentElement đã sẵn sàng, cập nhật ngay lập tức
        // Không cần đợi đóng/mở lại
        if(this.isOpen && this.contentElement)
        {
            this._flushPending();
        }
    }

    setFooterContent(html){
        if(!this.footer) {
            console.warn(`Movia ${this.id} does not have a footer`)
            return;
        }
        const safeHtml = this._sanitizeHTML(html);
        this._footerContent = safeHtml;

        if(!this._footerContentEl){
            this._pendingFooterContent = safeHtml;
            return;
        }
        this._footerContentEl.innerHTML = safeHtml;
    }

    _escapeId(id)
    {
        return id.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
    }

    // Kiểm tra trùng lặp ID của button    
    _isDuplicateButtonId(id){
        if(!id) return false;

        if(this._footerButtons?.some(btn=>btn.id === id))
        {
            return true;
        }
        
        if(this._pendingFooterButtons?.some(btn => btn.id === id)){
            return true;
        }
        
        if(this.footerElement && this.footerElement.querySelector(`#${this._escapeId(id)}`)){
            return true;
        }


        return false;
    }

    addFooterButton(btnConfig = {})
    {
        if(!this.footer) return;
        if(!btnConfig || typeof btnConfig !== "object") return; 
        
        const {id} = btnConfig;
        if(!id){
            console.warn("Button must have ID")
            return;
        }

        if(this._isDuplicateButtonId(id))
        {
            console.warn(`Duplicate button ID "${id}"`);
            return;
        }

        if(!this.footerElement)
        {
            this._pendingFooterButtons.push(btnConfig);
            return;
        }

        // Đã render -> append DOM
        const btn = this._createButton(btnConfig);
        this._footerButtonsEl.appendChild(btn);
        this._footerButtons.push(btnConfig);
    }

    // --- Nested Movia (Gán sự kiện mở/đóng Movia con) -----
    _bindChildEvents(backdrop)
    {
        if(this._childClickHandle) return;
        this._childClickHandle = (e) =>{
                const btn = e.target.closest("[data-open-movia]");
                if(!btn) return;
                const openId = btn.dataset.openMovia;
                if(!openId) return;
                const child = moviaRegistry.get(openId);
                child?.open();
        }
        
        backdrop.addEventListener("click",this._childClickHandle);
    }

    _unbindChildEvents(backdrop){
        if(this._childClickHandle)
        {
            backdrop.removeEventListener("click",this._childClickHandle)
            this._childClickHandle = null;
        }

    }


    // ------- Helper ------ 
    renderLabel(input) // Xử lý chuyển đổi dữ liệu -> DOM node an toàn 
    {
        if(input == null) return this._createSpan("")
        if(input instanceof HTMLElement) return input.cloneNode(true);

        if(typeof input === "function"){
            try {return this.renderLabel(input());}
            catch(err) {return this._createSpan(String(err))}
        }

        if(typeof input !== "string") return this._createSpan(String(input));
        
        if(!/[<>]/.test(input))  return this._createSpan(input);

        const span = document.createElement("span");
        span.innerHTML = this._sanitizeHTML(input);
        return span;
    }

    _createSpan(text)
    {
        const span = document.createElement("span");
        span.innerText = String(text);
        return span;
    }    

    _createButton({id ,label,classNames = "",onClick} = {})
    {   
        const btn = document.createElement("button")
        btn.type = "button";

        if(id) btn.id = id;

        // Xử lý class cho Button
        if(Array.isArray(classNames))
        {
            classNames.filter(Boolean).forEach(cls => btn.classList.add(cls));
        } else if(typeof classNames === "string" && classNames.trim())
        {
            classNames.split(/\s+/).forEach(cls => btn.classList.add(cls));
        }

        // Xử lý HTML entity(kí tự đặc biệt) và Text,DOM Node,Html string,Object
        if(typeof label === "string" && /^&[a-zA-Z0-9]+;?$/.test(label))
        {
            btn.innerHTML = label;
        } else {
            btn.appendChild(this.renderLabel(label));
        }

        // Chức năng hoạt động
        if(typeof onClick === "function")
        {
            const handler = (e) => {
                onClick.call(this,e);
            }
            btn.addEventListener("click", handler);
            this._handlers.set(btn,handler);
        }

        return btn;
    }

    _getTransitionDuration(element){
        const { transitionDuration, transitionDelay } = getComputedStyle(element);

        const durations = transitionDuration.split(",");
        const delays = transitionDelay.split(",");

        const toMs = (time) => {
            const t = parseFloat(time);
            if(isNaN(t)) return 0;
            return time.includes("ms") ? t : t * 1000;
        };

        const result = Math.max(
            ...durations.map((d, i) => toMs(d) + toMs(delays[i] || delays[0]))
        );

        return Number.isFinite(result) ? result : 0;

    }

    // Browser phát ra một event (transitionend) cho JavaScript khi animation CSS kết thúc
    _onTransitionEnd(element, callback)
    {
        if(!element) return;
        let called = false;
        let timer = null;
        const done = (e) => {
            if(e && e.target !== element) return;
            if(called) return;
            called = true;
            clearTimeout(timer);
            element.removeEventListener("transitionend", done);
            callback();
        }

        element.addEventListener("transitionend", done);
        
        const duration = this._getTransitionDuration(element);
        timer = setTimeout(done, duration + 50); // Thêm một khoảng thời gian nhỏ để đảm bảo callback được gọi ngay cả khi sự kiện transitionend không được kích hoạt
    }
 
}




