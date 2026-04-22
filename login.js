export function initLogin(modal){
    modal.onReady = () => {
        const form = modal.backdrop.querySelector("#loginForm");
        const emailInput = modal.backdrop.querySelector("#email");
        const passInput = modal.backdrop.querySelector("#password");
        const toggleBtn = modal.backdrop.querySelector("#togglePass");
    
        toggleBtn.addEventListener("click", () => {
            const isHidden = passInput.type === "password";
            passInput.type = isHidden ? "text" : "password";
            toggleBtn.textContent = isHidden ? "Ẩn" : "Hiện";
        });

        form?.addEventListener("submit", (e) => {
            e.preventDefault();
            handleLogin(emailInput, passInput, form, modal);
        });
    }
}   

function handleLogin(emailInput, passInput,form,modal)
{
    const userName = emailInput.value.trim();
    const passWord = passInput.value.trim();
    
    if(!isStrongPassWord(passWord))
    {
        alert("Password phải mạnh: chữ hoa, chữ thường, số, ký tự đặc biệt và không chứa khoảng trắng.");
        passInput.value = "";
        passInput.focus();
        return;
    }
    // Lấy account từ localStorage
    const accounts = JSON.parse(localStorage.getItem("accounts") || "[]");
    const isDuplicate = accounts.some((acc) => acc.user === userName);
    if(isDuplicate)
    {
        alert("Tài khoản đã tồn tại");
        emailInput.value = "";
        emailInput.focus();
        return;
    }
    accounts.push({user:userName, pass:passWord});
    localStorage.setItem("accounts",JSON.stringify(accounts));
    alert("Đăng ký tài khoản thành công");
    form.reset();
    modal.close();
}

function isStrongPassWord(passWord) {
    if (typeof passWord !== "string" || passWord.length < 8) return false;
    let hasUpper = false,
        hasLower = false,
        hasDigit = false,
        hasSpecial = false;
    
    for (let char of passWord) {
        // Không cho phép khoảng trắng (space/tab/newline…)
        if (/\s/.test(char)) return false;
        if (char >= "A" && char <= "Z") hasUpper = true;
        if (char >= "a" && char <= "z") hasLower = true;
        if (char >= "0" && char <= "9") hasDigit = true;
        const code = char.charCodeAt(0);
        if (
            (code >= 33 && code <= 47) ||   // ! " # $ % & ' ( ) * + , - . /
            (code >= 58 && code <= 64) ||   // : ; < = > ? @
            (code >= 91 && code <= 96) ||   // [ \ ] ^ _ `
            (code >= 123 && code <= 126)    // { | } ~
        ) {
            hasSpecial = true;
        }
    }

    return hasUpper && hasLower && hasDigit && hasSpecial;
};





