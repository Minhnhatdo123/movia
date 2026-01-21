let activeScrollLockOwner = null; // Biến theo dõi Movia đang khóa cuộn trang

// Stack quản lý Movia lồng nhau
const moviaStack = [];

// Lấy Movia trên cùng trong stack
function getTopMovia() {
    return moviaStack[moviaStack.length - 1] || null;
}

// Lấy Movia trên cùng yêu cầu khóa cuộn trang
function getTopScrollLockMovia() {
    for (let i = moviaStack.length - 1; i >= 0; i--) {
        if (moviaStack[i].enableScrollLock) {
            return moviaStack[i];
        }
    }
    return null;
}

// Cập nhật trạng thái khóa cuộn trang
function updateScrollLock()
{
    const newOwner = getTopScrollLockMovia();
    if(newOwner === activeScrollLockOwner) return;

    // chỉ Owner hiện tại mới mở khóa
    if(activeScrollLockOwner){
        activeScrollLockOwner._unlockScrollIfOwner();
    }

    if(newOwner){
        newOwner._activeScrollLockTarget = newOwner._resolveScrollLockTarget();
        newOwner._lockScroll();
    }
        
    activeScrollLockOwner = newOwner;
}

// Các khóa cấu hình toàn cục được phép thiết lập
const ALLOWED_KEYS = [
    "defaultCloseMethods",
    "defaultCssClass",
    "destroyOnClose",
    "autoSanitize",
    "scrollLockTarget",
    "enableScrollLock"
]

export const MoviaGlobal ={
    // Cấu hình mặc định toàn cục cho Movia
    defaultCloseMethods : ['button','overlay','escape'],
    defaultCssClass: [],
    destroyOnClose : false,
    autoSanitize: true, // cờ flag tự động làm sạch dữ liệu

    scrollLockTarget: null, // mục tiêu khóa cuộn trang toàn cục
    enableScrollLock: true, // cờ cho Movia có yêu cầu khóa cuộn trang
    
    // Cập nhật cấu hình toàn cục
    set(config = {})
    {
        Object.keys(config).forEach(key => {
            if(!ALLOWED_KEYS.includes(key))
            {
                console.warn(`[Movia] Invalid global config key: "${key}"`);
                return;
            }
                this[key] = config[key];
        });
    }
}

let moviaIdCounter = 0;

export class Movia {
    // Định nghĩa các field(thuộc tính) mặc định mỗi Movia
    templateId = null;
    content = "";
    template = null; // DOM <template> sau khi resolve

    closeMethods = [];
    destroyOnClose = false; // có xóa khỏi DOM khi đóng không
    enableScrollLock = true; // cho phép khóa cuộn trang
    preserveScrollPosition = false; // khôi phục vị trí cuộn khi đóng
    scrollLockTarget = null; // mục tiêu khóa cuộn trang riêng cho movia này
    
    footer = false;
    cssClass = [];
    footerButton = [];
    onOpen = null;
    onClose = null;

    constructor(config = {}) // Object người dùng truyền vào
    {   // trộn cấu hình người dùng với mặc định
        const defaultConfig = {
            templateId : null,
            content : "", 
            closeMethods : MoviaGlobal.defaultCloseMethods.slice() , // Các phương pháp đóng
            destroyOnClose : MoviaGlobal.destroyOnClose, // loại bỏ khỏi DOM
            cssClass : MoviaGlobal.defaultCssClass.slice(),
    
            enableScrollLock : MoviaGlobal.enableScrollLock, // khóa cuộn trang
            scrollLockTarget : null, // mục tiêu khóa cuộn trang riêng cho movia này

            footer : false, 
            footerButton : [], // Button từ config ban đầu
            onOpen : null ,
            onClose : null,

            preserveScrollPosition:false // khôi phục vị trí cuộn khi đóng
        }
        const finalConfig = Object.assign({},defaultConfig,config);
        Object.assign(this,finalConfig); // sao chép toàn bộ thuộc tính vào this

        /* ===============================
           VALIDATE content / templateId (kiểm tra dữ liệu)
        =============================== */

        if(!this.content && !this.templateId)
        {
            throw new Error("Movia requires either 'content' or 'templateId' to be provided.");
        }

        if(this.content && this.templateId)
        {
            this.content = null;
            console.warn("Both 'content' and 'templateId' are provided. 'templateId' will take precedence.");
        }

        if (this.templateId) {
            const template = document.getElementById(this.templateId);

            if (!template) {
                throw new Error(
                `[Movia] Template with id "${this.templateId}" does not exist.`
                );
            }
                this.template = template; // lưu lại để render
        } else {
            this.template = null;
        }

        // Trạng thái (sống) runtime : phụ thuộc Open/ Close / destroy
        this.id = ++moviaIdCounter; // ID của movia 
        this.isOpen = false; // mặc định chưa mở
        this.backdrop = null; // khởi tạo biến để sau này lưu DOM của backdrop, 
        this.footerElement = null;
        this.contentElement = null;
        this._childOpenHandler = null; // handler mở movia con
       
        this._isMounted = false; // trạng thái đã mount(gắn) vào DOM hay chưa
        this._isDestroyed = false; // trạng thái đã bị hủy hay chưa
        
        // Pending states : trạng thái chờ xử lý - nội tạng FrameWork
        this._pendingContent = null;
        this._pendingFooterButtons = []; // Button thêm trực tiếp lúc đang mở
        this._pendingFooterContent = null; // Nội dung chân trang có thể thêm
        this._footerInitialized = false; // Footer đã được render từ dữ liệu được truyền vào hay chưa
        
        this._keydownBound = false; // cờ đánh dấu đã gắn sự kiện keydown chưa
        this._keydownHandler = null; // Hành vi xử lý
        this._childMovias = []; // List movia
        this._parentMovia = null; // movia cha nếu có

        // Scroll Lock runtime : mở khóa chính xác khi modal đóng
        this._isScrollLocked = false; // trạng thái khóa cuộn trang
        this._activeScrollLockTarget = null; // mục tiêu khóa cuộn trang hiện tại
        this._preScrollPaddingRight = null; // lưu paddingRight ban đầu của scrollLockTarget

    }

    // Tạo DOMmovia 
    createMovia() {
        if (this.backdrop) return this.backdrop;

        // Tạo backdrop
        const backdrop = document.createElement("div");
        backdrop.className = "movia";
        backdrop.id = `movia-${this.id}`

        // Tạo container
        const container = document.createElement("div");
        container.className = "movia__container";

        // Kiểm tra mảng css truyền vào
        if(Array.isArray(this.cssClass) && this.cssClass.length)
        {
            this.cssClass.forEach(cls => 
            {
                if(typeof cls === "string" && cls.trim())
                {
                    container.classList.add(cls)
                }
            });
        }
        
        // Thêm nút close nếu có 'button' trong closeMethods
        if(Array.isArray(this.closeMethods) && this.closeMethods.includes('button')){

            const closeBtn = this._createButton("&times;","movia__close" ,this.close.bind(this))
            container.appendChild(closeBtn)
            // Đóng movia khi nhấn nút close
        }
        
        // Tạo movia__content
        const moviaContent = document.createElement("div");
        moviaContent.className = "movia__content";
        
        
        // Lấy template hoặc content
        if (this.templateId) {
            const template = document.getElementById(this.templateId);
            if (template && template.content) {
                moviaContent.appendChild(template.content.cloneNode(true));
            }
            else {
                moviaContent.innerHTML = String(this.content ?? "");
            }
        } else {
            moviaContent.innerHTML = String(this.content ?? "");
        }
        
        this.contentElement = moviaContent;
        container.append(moviaContent);
        

        // Đóng movia khi click overlay
        if (Array.isArray(this.closeMethods) && this.closeMethods.includes("overlay")) {
            backdrop.addEventListener("click", (e) => {
                if (e.target === backdrop) this.close();
            });
        }

        // ESC key - trường hợp movia lồng nhau thì nó đóng cái cuối
        if(Array.isArray(this.closeMethods) && this.closeMethods.includes('escape'))
        {
            this._keydownHandler = (e) =>{
                if (e.key === "Escape")
                {   
            // nó sẽ đóng movia trên cùng (movia lồng nhau)
                    const top = getTopMovia();
                    if(top === this){
                        this.close();
                    }
                }     
            }
        }

        // Tạo phần Footer (chân trang)
        if(this.footer)
        {
            const moviaFooter = document.createElement("div");
            moviaFooter.className = 'movia__footer';

            // Lưu lại để có thể thay đổi biến Footer
            this.footerElement = moviaFooter 
            
            this._renderFooter(); // render footer lần đầu từ config    
            container.appendChild(moviaFooter);
        }

        backdrop.append(container);
        this.backdrop = backdrop; // lưu lại biến
        return backdrop;
    }

    // Thay đổi nội dung content
    updateContent(html)
    {
        if(MoviaGlobal.autoSanitize)
        {
            html = this.sanitizeHTML(html);
        }
        
        // Nếu chưa từng tạo movia(chưa open)
        if(!this.backdrop)
        {
            this._pendingContent = html;
            return ;
        }
        const contentEl = this.backdrop.querySelector(".movia__content")
        if(this.isOpen && contentEl)
        {
            contentEl.innerHTML = html;
        } else{
            this._pendingContent = html;
        }
        this.content = html;
    }

    // Thay đổi Footer theo ý muốn 
    setFooterContent(html)
    {   
        if(MoviaGlobal.autoSanitize)
        {
            html = this.sanitizeHTML(html);
        }
        
        // Nếu footer chưa được tạo (movia chưa mở)
        if(!this.footerElement) {
            this._pendingFooterContent = html;
            return;
        }
        
        // Nếu footer đã tồn tại (movia mở) → cập nhật ngay
        this.footerElement.innerHTML = html;
    }

    // Lọc HTML an toàn - tránh XSS
    sanitizeHTML(html) {
        // Bật/ tắt tính năng lọc HTML
        if(!MoviaGlobal.autoSanitize)
        {
            return String(html ?? "");
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(String(html), "text/html");

        const dangerousTags = ["script", "iframe", "embed", "object", "link", "meta"];
        const dangerousAttrs = ["onerror", "onclick", "onload", "oninput", "onchange", "onmouseover"];
        
        // 1. XÓA TAG NGUY HIỂM
        dangerousTags.forEach(tag => {
            doc.querySelectorAll(tag).forEach(el => el.remove());
        });

        // 2. Lọc attribute nguy hiểm
        doc.querySelectorAll("*").forEach(el => {
            [...el.attributes].forEach(attr => {
                const name = attr.name.toLowerCase();
                const value = attr.value;

                // Xóa bất kỳ on* event
                if (name.startsWith("on")) {
                    el.removeAttribute(name);
                    return;
                }

                // Xóa attribute nguy hiểm theo whitelist
                if (dangerousAttrs.includes(name)) {
                    el.removeAttribute(name);
                    return;
                }

                // Chặn javascript: trong href / src
                if (
                    (name === "href" || name === "src") &&
                    value.trim().toLowerCase().startsWith("javascript:")
                ) {
                    el.removeAttribute(name);
                    return;
                }
            });
        });

        return doc.body.innerHTML;
    }


    // Kiểm tra những trường hợp label(addFooterButton)
    renderLabel(input)
    {
        // Trường hợp DOM node → thêm trực tiếp
        if(input instanceof HTMLElement){
            return input.cloneNode(true);
        }

        // Trường hợp function → gọi nó 
        if(typeof input === "function")
        {   
            try{
                return this.renderLabel(input());
            } catch(err)
            {
                return this._createSpan(String(err));
            }
        }   

        // Không phải string → chuyển thành text
        if(typeof input !== "string"){
            return this._createSpan(String(input));
        }

        if(!/[<>]/.test(input))
        {
            return this._createSpan(input);
        }

        const span = document.createElement("span");
        span.innerHTML = this.sanitizeHTML(input);
        return span
    }

    _createSpan(text)
    {
        const span = document.createElement("span");
        span.textContent = String(text);
        return span;
    }

    _createButton(label,classNames = "",onClick = null)
    {
        const btn = document.createElement("button");
        btn.type = "button";

        if(Array.isArray(classNames))
        {   
            // Lọc giá trị Truthy và add vào classList
            classNames.filter(Boolean).forEach(cls => btn.classList.add(cls));
        } else if (typeof classNames === "string" && classNames.trim())
        {
            // băm nhỏ phần tử kể cả có nhiều dấu space liên tục
            classNames.split(/\s+/).forEach(cls => btn.classList.add(cls));
        }
        
        if(typeof onClick === "function")
        {
            btn.addEventListener("click", (e) => {
                onClick.call(this,e)
            });
        }

        if(typeof label === "string" && /^&[a-zA-Z0-9]+;?$/.test(label))
        {
            btn.innerHTML = label;
        } else {
            const rendered = this.renderLabel(label);
            if(rendered instanceof DocumentFragment)
            {
                btn.appendChild(rendered);
            } else {
                btn.appendChild(rendered);
            }
        }
        return btn;
    }
    
    // Thêm nút vào footer
    addFooterButton(btnConfig = {}) {
        if (!btnConfig || typeof btnConfig !== "object") return;

        const exists = [...this.footerButton,...this._pendingFooterButtons]
        .some(
            btn => btn.label === btnConfig.label
        );
        if (exists) return;

        // Chưa mount hoặc chưa có footer -> pending
        if(!this.footerElement)
        {
            this._pendingFooterButtons.push(btnConfig);
            return;
        }

        this.footerButton.push(btnConfig);
        this._renderFooter();
        
    }
    
    _renderFooter() {
        if (!this.footer || !this.footerElement) return;

        // Lần đầu render -> merge pending buttons
        if (!this._footerInitialized) {
            this.footerButton.push(...this._pendingFooterButtons);
            this._pendingFooterButtons = [];
            this._footerInitialized = true;
        }

        // Clear sạch footer
        this.footerElement.innerHTML = "";

        // Render footer content nếu có
        if (this._pendingFooterContent !== null) {
            this.footerElement.innerHTML = this._pendingFooterContent;
        }

        // Render buttons từ DATA
        this.footerButton.forEach(cfg => {
            const btn = this._createButton(
                cfg.label,
                cfg.classNames,
                cfg.onClick
            );
            this.footerElement.appendChild(btn);
        });
    }
    

    // Đăng ký Movia con(lồng nhau)
    setupChildMovia(childMovia)
    {
        if(!childMovia) return;

        this._childMovias.push(childMovia);
        childMovia._parentMovia = this;

        if(this.isOpen && this.backdrop)
        {
            this._attachChildOpenHandler();
        }
    }

    // Gắn sự kiện mở Movia con
    _attachChildOpenHandler()
    {
        if(!this.backdrop) return ;

        if(this._childOpenHandler) return;

        this._childOpenHandler = (e) => {
            const btn = e.target.closest("[data-open-movia]");
            if(!btn) return ;
            const openId = btn.dataset.openMovia ?? btn.getAttribute("data-open-movia");
            if(!openId) return;
            const child = this._childMovias.find(m =>
                openId === String(m.id) || openId === m.templateId
            );
            if(child){
                child.open();
            }
        }

        this.backdrop.addEventListener("click", this._childOpenHandler);
    }

    // Xác định phần tử khóa cuộn trang
    _resolveScrollLockTarget(){
        const input = this.scrollLockTarget ?? 
                      MoviaGlobal.scrollLockTarget ?? 
                      document.body 

        if(typeof input === "function"){
            return input();
        }
        if(typeof input === "string"){
            return document.querySelector(input) 
        }
        if(input instanceof HTMLElement){  
            return input;
        }
        return document.body; 
    }
    
    _hasScrollbar(target){
        if(target === document.body || document.documentElement){
            const html = document.documentElement;
            const body = document.body;
            return (html.scrollHeight > html.clientHeight) || 
            (body.scrollHeight > body.clientHeight);
        }
        return target.scrollHeight > target.clientHeight;
    }

    // Khóa cuộn trang
    _lockScroll(){
        if(this._isScrollLocked) return;
        const target = this._activeScrollLockTarget;
        if(!target) return;
        
        this._isScrollLocked = true;
        
        this._preScrollPaddingRight = window.getComputedStyle(target).paddingRight || "";
        const scrollbarWidth = this._hasScrollbar(target) ? this._getScrollbarWidth() : 0;
        
        target.classList.add("movia--no-scroll");
        target.style.paddingRight = 
        `${(parseFloat(this._preScrollPaddingRight) || 0) + scrollbarWidth}px`;
    }

    // Mở khóa cuộn trang
    _unlockScrollIfOwner(){
        if(activeScrollLockOwner !== this) return;

        if(!this._isScrollLocked) return;
        const target = this._activeScrollLockTarget;
        if(!target) return;
        
        target.classList.remove("movia--no-scroll");
        target.style.paddingRight = this._preScrollPaddingRight;
        
        this._isScrollLocked = false;
        this._activeScrollLockTarget = null;
        this._preScrollPaddingRight = null;
    }

    // Mở Movia 
    open() {
        if (this._isDestroyed) {
            console.warn("Movia has been destroyed and cannot be reopened.");
            return;
        }

        if (this.isOpen) return; // Nếu mở movia thì quay lại
        this.isOpen = true;
        
        // Push stack movia 
        moviaStack.push(this);

        // Cập nhật trạng thái khóa cuộn trang
        updateScrollLock();

        // Mount DOM nếu chưa có
        if(!this._isMounted)
        {
            this.backdrop = this.createMovia();
            document.body.appendChild(this.backdrop);   
            this._isMounted = true;
        }

        // Nếu vừa tạo → gắn event mở movia con
        if (this._childMovias.length) {
            this._attachChildOpenHandler();
        }

        // Add vào DOm nếu chưa có
        if (!document.body.contains(this.backdrop)){
            document.body.appendChild(this.backdrop);
        } 

        // Apply pending content nếu có
        if(this._pendingContent !== null)
        {
            const contentEl = this.backdrop.querySelector(".movia__content");
            if(contentEl)
            {
                contentEl.innerHTML = this._pendingContent;
            }
            this._pendingContent = null;
        }

        // thêm event Escape trong Open() để tắt movia 
        if (this._keydownHandler && !this._keydownBound) {
            document.addEventListener("keydown", this._keydownHandler);
            this._keydownBound = true;
        }
        
        this.backdrop.style.visibility = "";
        // đợi browser render xong frame hiện tại rồi mới chạy animation
        requestAnimationFrame(() => {
            this.backdrop.classList.add("movia--show");
            // Thêm hiệu ứng show - đáp ứng yêu cầu cùng 1 movia 
            this.backdrop.dispatchEvent(new CustomEvent("movia:ready"));
            this.onReady?.();
        });

        const backdrop = this.backdrop;
        this._onTransitionEnd(backdrop,()=>{
            if(!this.isOpen) return; // nếu đã đóng trong lúc chờ transition
                // Khôi phục nơi vị trí người dùng đang đọc

            if (this.preserveScrollPosition && typeof this._saveScroll === "number") {
                const moviaContent = backdrop.querySelector(".movia__content");
                if (moviaContent) {
                    moviaContent.scrollTop = this._saveScroll;
                }
            }

            this.onOpen?.()
        })
    }

    // Đóng Movia 
    close(forceDestroy = false) {
        // Nếu mà đóng/ chưa có gì thì quay lại        
        if (!this.isOpen || !this.backdrop) return; 
        
        this.isOpen = false; // mặc định đóng

        // Xóa movia khỏi stack
        const index = moviaStack.indexOf(this);
        if(index !== -1 ) {
            moviaStack.splice(index,1);
        }

        
        const backdrop = this.backdrop;
        
        // Lưu vị trí người dùng đang đọc
        if(this.preserveScrollPosition){
            const moviaContent = backdrop.querySelector(".movia__content");
            this._saveScroll = moviaContent.scrollTop;
        }
        
        // Xóa backdrop với transition
        backdrop.classList.remove("movia--show");
        
        // Xóa event Escape trong Close() để tắt movia 
        if (this._keydownHandler && this._keydownBound) {
            document.removeEventListener("keydown", this._keydownHandler);
            this._keydownBound = false;
        }
        
        const willDestroy = forceDestroy || this.destroyOnClose;
        
        this._onTransitionEnd(backdrop,() => {
            // Cập nhật trạng thái khóa cuộn trang
            updateScrollLock();
            
            if(this.isOpen) return; // chỉ bắt đầu đóng nếu vẫn đang đóng
                if(willDestroy)
                {
                    if(this._childOpenHandler){
                        backdrop.removeEventListener("click", this._childOpenHandler);
                        this._childOpenHandler = null;
                    }

                    backdrop.remove();// Xóa khỏi DOM
                    this.backdrop = null;  // Rest về rỗng
                    this._isMounted = false; // Chưa mount

                    this.footerElement = null; // Reset để lần mở sau tạo lại
                    this._footerInitialized = false;

                    // reset footerButton để không append lại
                    this._pendingFooterButtons = [];
                    this._pendingFooterContent = null;
                    this._pendingContent = null;
                } else{
                    backdrop.style.visibility = "hidden"; // Nó chỉ ẩn
                }
                this.onClose?.()
        })
    }

    // Bắt buộc mở khóa cuộn trang (dành cho trường hợp đặc biệt)
    _forceReleaseScrollLock(){
        if(activeScrollLockOwner !== this) return;
        this._unlockScrollIfOwner();
        activeScrollLockOwner = null;
    }

    destroy()
    {
        this._isDestroyed = true; // đã bị hủy

        // mở khóa cuộn trang nếu cần
        this._forceReleaseScrollLock(); 

        // Gỡ bỏ khỏi movia cha nếu có
        if(this._parentMovia){
            const list = this._parentMovia._childMovias;
            const index = list.indexOf(this);
            if(index !== -1){
                list.splice(index,1);
            }
            this._parentMovia = null;
        }

        // Đóng movia nếu đang mở
        if(this.isOpen)
        {
            this.close(true);
        } else if(this.backdrop){
            this.backdrop.remove();
        }
    }

    // đợi kết thúc transition CSS
    _onTransitionEnd(backdrop, callback) 
    {
        // Không có animation → gọi callback
        if (!backdrop) {
            callback?.(); // Kiểm tra bên trái nếu null/undefined thì trả về undefined
            return;
        }

        let finished = false; 

        // Hàm kết thúc DUY NHẤT
        const finish = () => {
            if (finished) return;   // chặn gọi lại
            finished = true;

            backdrop.removeEventListener("transitionend", onTransitionEnd);
            clearTimeout(timeoutId);

            try {
                callback?.();
            } catch (err) {
                console.error(err);
            }
        };

        // Khi CSS transition kết thúc
        const onTransitionEnd = (e) => {
            // chỉ xử lý transition của chính backdrop
            if (e.target !== backdrop) return;
            finish();
        };

        // Nghe transitionend
        backdrop.addEventListener("transitionend", onTransitionEnd);

        // Dự phòng: nếu không có transition thì tự kết thúc
        const timeoutId = setTimeout(finish, 350);
    }

    _getScrollbarWidth()
    {
        if (typeof this._scrollbarWidth === "number"){
            return this._scrollbarWidth;
        }

        const div = document.createElement("div");
        Object.assign(div.style, {
            overflow: "scroll",
            position: "absolute",
            top: "-9999px",
            width: "100px",
            height: "100px"
        });

        document.body.appendChild(div);
        this._scrollbarWidth = div.offsetWidth - div.clientWidth;
        document.body.removeChild(div);

        return this._scrollbarWidth;
    }
} 