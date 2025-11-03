(globalThis.TURBOPACK = globalThis.TURBOPACK || []).push([typeof document === "object" ? document.currentScript : undefined, {

"[project]/src/lib/api/tmdb-v4.js [app-client] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname, k: __turbopack_refresh__, m: module } = __turbopack_context__;
{
__turbopack_context__.s({
    "addItemToList": (()=>addItemToList),
    "clearList": (()=>clearList),
    "createAccessToken": (()=>createAccessToken),
    "createList": (()=>createList),
    "createRequestToken": (()=>createRequestToken),
    "getAccountLists": (()=>getAccountLists),
    "getListDetails": (()=>getListDetails),
    "getUserInfo": (()=>getUserInfo),
    "getWatchlistMovies": (()=>getWatchlistMovies),
    "getWatchlistTVShows": (()=>getWatchlistTVShows),
    "logout": (()=>logout),
    "removeItemFromList": (()=>removeItemFromList),
    "updateList": (()=>updateList)
});
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
const API_URL_V4 = "https://api.themoviedb.org/4";
const API_KEY_V4 = ("TURBOPACK compile-time value", "934b1e031967a214521ca1a5426baa2b");
const headers = {
    Authorization: `Bearer ${API_KEY_V4}`,
    "Content-Type": "application/json;charset=utf-8"
};
async function createRequestToken() {
    const res = await fetch(`${API_URL_V4}/auth/request_token`, {
        method: "POST",
        headers
    });
    return res.json();
}
async function createAccessToken(request_token) {
    const res = await fetch(`${API_URL_V4}/auth/access_token`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            request_token
        })
    });
    return res.json();
}
async function getUserInfo(accessToken) {
    const res = await fetch(`https://api.themoviedb.org/4/account`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    });
    return res.json();
}
async function logout(access_token) {
    const res = await fetch(`${API_URL_V4}/auth/access_token`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({
            access_token
        })
    });
    return res.ok;
}
async function getAccountLists(account_id) {
    const res = await fetch(`${API_URL_V4}/account/${account_id}/lists`, {
        headers
    });
    return res.json();
}
async function getWatchlistMovies(account_id) {
    const res = await fetch(`${API_URL_V4}/account/${account_id}/watchlist/movies`, {
        headers
    });
    return res.json();
}
async function getWatchlistTVShows(account_id) {
    const res = await fetch(`${API_URL_V4}/account/${account_id}/watchlist/tv`, {
        headers
    });
    return res.json();
}
async function createList(name, description = "", iso_639_1 = "en") {
    const res = await fetch(`${API_URL_V4}/list`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            name,
            description,
            iso_639_1
        })
    });
    return res.json();
}
async function getListDetails(list_id) {
    const res = await fetch(`${API_URL_V4}/list/${list_id}`, {
        headers
    });
    return res.json();
}
async function addItemToList(list_id, media_id, media_type = "movie") {
    const res = await fetch(`${API_URL_V4}/list/${list_id}/items`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            items: [
                {
                    media_type,
                    media_id
                }
            ]
        })
    });
    return res.json();
}
async function removeItemFromList(list_id, media_id, media_type = "movie") {
    const res = await fetch(`${API_URL_V4}/list/${list_id}/items`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({
            items: [
                {
                    media_type,
                    media_id
                }
            ]
        })
    });
    return res.json();
}
async function clearList(list_id) {
    const res = await fetch(`${API_URL_V4}/list/${list_id}/clear`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            confirm: true
        })
    });
    return res.json();
}
async function updateList(list_id, name, description, iso_639_1 = "en") {
    const res = await fetch(`${API_URL_V4}/list/${list_id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
            name,
            description,
            iso_639_1
        })
    });
    return res.json();
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(module, globalThis.$RefreshHelpers$);
}
}}),
"[project]/src/components/ListsDashboard.jsx [app-client] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname, k: __turbopack_refresh__, m: module } = __turbopack_context__;
{
__turbopack_context__.s({
    "default": (()=>ListsDashboard)
});
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2d$v4$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/api/tmdb-v4.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
function ListsDashboard() {
    _s();
    const [accountId, setAccountId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [accessToken, setAccessToken] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [lists, setLists] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    const [loading, setLoading] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(true);
    const [newList, setNewList] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        name: "",
        description: ""
    });
    const [editing, setEditing] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    // Obtener el token y accountId al iniciar
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "ListsDashboard.useEffect": ()=>{
            const token = localStorage.getItem("tmdb_access_token");
            if (token) {
                setAccessToken(token);
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2d$v4$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getUserInfo"])(token).then({
                    "ListsDashboard.useEffect": (user)=>{
                        setAccountId(user.id);
                        fetchLists(user.id, token);
                    }
                }["ListsDashboard.useEffect"]);
            } else {
                console.error("No hay token guardado en localStorage");
                setLoading(false);
            }
        }
    }["ListsDashboard.useEffect"], []);
    // Obtener listas
    async function fetchLists(id, token) {
        setLoading(true);
        const data = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2d$v4$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getAccountLists"])(id, token);
        setLists(data.results || []);
        setLoading(false);
    }
    // Crear nueva lista
    async function handleCreate(e) {
        e.preventDefault();
        if (!accessToken) return;
        const created = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2d$v4$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createList"])(newList.name, newList.description, "es", accessToken);
        if (created.id) {
            await fetchLists(accountId, accessToken);
            setNewList({
                name: "",
                description: ""
            });
        }
    }
    // Actualizar lista existente
    async function handleUpdate(e) {
        e.preventDefault();
        if (!accessToken) return;
        const updated = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2d$v4$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["updateList"])(editing.id, editing.name, editing.description, "es", accessToken);
        if (updated.success) {
            setEditing(null);
            await fetchLists(accountId, accessToken);
        }
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "space-y-6",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                onSubmit: editing ? handleUpdate : handleCreate,
                className: "bg-zinc-800 p-4 rounded shadow-md space-y-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-xl font-semibold",
                        children: editing ? "Editar Lista" : "Crear Nueva Lista"
                    }, void 0, false, {
                        fileName: "[project]/src/components/ListsDashboard.jsx",
                        lineNumber: 71,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                        type: "text",
                        placeholder: "Nombre de la lista",
                        value: editing ? editing.name : newList.name,
                        onChange: (e)=>editing ? setEditing({
                                ...editing,
                                name: e.target.value
                            }) : setNewList({
                                ...newList,
                                name: e.target.value
                            }),
                        className: "w-full p-2 bg-zinc-900 rounded border border-zinc-700",
                        required: true
                    }, void 0, false, {
                        fileName: "[project]/src/components/ListsDashboard.jsx",
                        lineNumber: 74,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("textarea", {
                        placeholder: "Descripción",
                        value: editing ? editing.description : newList.description,
                        onChange: (e)=>editing ? setEditing({
                                ...editing,
                                description: e.target.value
                            }) : setNewList({
                                ...newList,
                                description: e.target.value
                            }),
                        className: "w-full p-2 bg-zinc-900 rounded border border-zinc-700"
                    }, void 0, false, {
                        fileName: "[project]/src/components/ListsDashboard.jsx",
                        lineNumber: 86,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "submit",
                        className: "px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white",
                        children: editing ? "Guardar cambios" : "Crear lista"
                    }, void 0, false, {
                        fileName: "[project]/src/components/ListsDashboard.jsx",
                        lineNumber: 96,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/ListsDashboard.jsx",
                lineNumber: 67,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                        className: "text-2xl font-bold mb-4",
                        children: "Listas existentes"
                    }, void 0, false, {
                        fileName: "[project]/src/components/ListsDashboard.jsx",
                        lineNumber: 105,
                        columnNumber: 9
                    }, this),
                    loading ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        children: "Cargando..."
                    }, void 0, false, {
                        fileName: "[project]/src/components/ListsDashboard.jsx",
                        lineNumber: 107,
                        columnNumber: 11
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("ul", {
                        className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4",
                        children: lists.map((list)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("li", {
                                className: "bg-zinc-800 p-4 rounded shadow hover:shadow-lg transition",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                        className: "text-lg font-bold",
                                        children: list.name
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/ListsDashboard.jsx",
                                        lineNumber: 115,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-sm text-zinc-400 mb-2",
                                        children: list.description
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/ListsDashboard.jsx",
                                        lineNumber: 116,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                        className: "text-sm",
                                        children: [
                                            "🎞 ",
                                            list.item_count,
                                            " ítems"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/ListsDashboard.jsx",
                                        lineNumber: 117,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: async ()=>{
                                            const fullDetails = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$api$2f$tmdb$2d$v4$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getListDetails"])(list.id, accessToken);
                                            setEditing({
                                                id: list.id,
                                                name: fullDetails.name,
                                                description: fullDetails.description
                                            });
                                        },
                                        className: "mt-3 text-blue-400 hover:underline",
                                        children: "Editar"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/ListsDashboard.jsx",
                                        lineNumber: 118,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, list.id, true, {
                                fileName: "[project]/src/components/ListsDashboard.jsx",
                                lineNumber: 111,
                                columnNumber: 15
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/src/components/ListsDashboard.jsx",
                        lineNumber: 109,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/ListsDashboard.jsx",
                lineNumber: 104,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/ListsDashboard.jsx",
        lineNumber: 66,
        columnNumber: 5
    }, this);
}
_s(ListsDashboard, "82IPET/vKC6F0QB3lFZ5p1gGZzk=");
_c = ListsDashboard;
var _c;
__turbopack_context__.k.register(_c, "ListsDashboard");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(module, globalThis.$RefreshHelpers$);
}
}}),
}]);

//# sourceMappingURL=src_e128edb0._.js.map