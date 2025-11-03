(globalThis.TURBOPACK = globalThis.TURBOPACK || []).push([typeof document === "object" ? document.currentScript : undefined, {

"[project]/src/lib/api/auth.js [app-client] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname, k: __turbopack_refresh__, m: module } = __turbopack_context__;
{
__turbopack_context__.s({
    "createAccessToken": (()=>createAccessToken),
    "createRequestToken": (()=>createRequestToken),
    "getUserInfo": (()=>getUserInfo),
    "logout": (()=>logout)
});
const BASE_URL = "https://api.themoviedb.org/4";
const HEADERS = {
    "Content-Type": "application/json"
};
async function createRequestToken() {
    const res = await fetch(`${BASE_URL}/auth/request_token`, {
        method: "POST",
        headers: HEADERS
    });
    const data = await res.json();
    return data.request_token;
}
async function createAccessToken(request_token) {
    const res = await fetch(`${BASE_URL}/auth/access_token`, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({
            request_token
        })
    });
    const data = await res.json();
    return data.access_token;
}
async function getUserInfo(accessToken) {
    const res = await fetch(`${BASE_URL}/account`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    });
    return res.json();
}
async function logout(accessToken) {
    const res = await fetch(`${BASE_URL}/auth/access_token`, {
        method: "DELETE",
        headers: HEADERS,
        body: JSON.stringify({
            access_token: accessToken
        })
    });
    return res.ok;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(module, globalThis.$RefreshHelpers$);
}
}}),
"[project]/src/app/login/page.jsx [app-client] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname, k: __turbopack_refresh__, m: module } = __turbopack_context__;
{
__turbopack_context__.s({
    "default": (()=>LoginButton)
});
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$auth$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api/auth.js [app-client] (ecmascript)");
'use client';
;
;
function LoginButton() {
    const handleLogin = async ()=>{
        const requestToken = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$auth$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createRequestToken"])();
        const redirectTo = `${window.location.origin}/auth/callback`;
        window.location.href = `https://www.themoviedb.org/authenticate/${requestToken}?redirect_to=${redirectTo}`;
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
        onClick: handleLogin,
        className: "bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700",
        children: "Iniciar sesión"
    }, void 0, false, {
        fileName: "[project]/src/app/login/page.jsx",
        lineNumber: 14,
        columnNumber: 5
    }, this);
}
_c = LoginButton;
var _c;
__turbopack_context__.k.register(_c, "LoginButton");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(module, globalThis.$RefreshHelpers$);
}
}}),
}]);

//# sourceMappingURL=src_fc8c690c._.js.map