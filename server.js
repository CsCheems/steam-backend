import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors());

let cache = {
  lastUpdate: 0,
  data: null,
};

const CACHE_TIME = 10_000;

let estadoAnterior = '';

// ===HELPERS===

async function fetchFromSteam(url) {
    const res = await fetch(url);
    
    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Steam API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    //console.log("Steam JSON: ", data);
    return data;
}

// ===OBTENER DATOS===

async function obtenJuegoActual(STEAM_KEY, STEAM_ID) {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_KEY}&steamids=${STEAM_ID}`;
    const data = await fetchFromSteam(url);
    const player = data.response.players[0]; 
    
    if(!player.gameid) return null;

    return{
        appid: player.gameid,
        name: player.gameextrainfo,
    };
}

//obtenJuegoActual();

async function obtenerTiempoDeJuego(appid, STEAM_KEY, STEAM_ID) {
    const url = `http://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${STEAM_KEY}&steamid=${STEAM_ID}&format=json`;
    const data = await fetchFromSteam(url);
    //console.log(data.response.games);

    const juego = data.response.games?.find((g) => g.appid == appid);

    if(!juego) return "0 hrs";

    //console.log(`${(juego.playtime_forever/60).toFixed(1)} hrs`);

    return `${(juego.playtime_forever/60).toFixed(1)} hrs`;

}

//obtenerTiempoDeJuego(2357570);

async function obtenLogros(appid, STEAM_KEY, STEAM_ID, LANGUAGE){
    const url = `http://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appid}&key=${STEAM_KEY}&steamid=${STEAM_ID}&l=${LANGUAGE}`;
    const data = await fetchFromSteam(url);
    //console.log(data.playerstats.achievements);

    return data.playerstats.achievements || [];
}

//obtenLogros(2357570);

async function obtenerEsquema(appid, STEAM_KEY, LANGUAGE) {
    const url = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${STEAM_KEY}&appid=${appid}&l=${LANGUAGE}`;
    const data = await fetchFromSteam(url);
    return data.game.availableGameStats?.achievements || [];
}

function normalizarLogros(userAch = [], schemaAch = []){
    const mapSchema = new Map(
        schemaAch.map(s => [s.displayName, s])
    );

    return userAch.map(logro => {
        const meta = mapSchema.get(logro.name);
        return{
            id: logro.name,
            name: meta.displayName || logro.name,
            image: meta?.icon || "",
            description: logro.description,
            achieved: logro.achieved === 1,
            unlocktime: logro.unlocktime || 0
        };
    });
}

function clasificarLogros(logros = []){
    return{
        desbloqueados: logros
            .filter(l => l.achieved == 1)
            .sort((a,b) => b.unlocktime - a.unlocktime),
        
        bloqueados: logros.filter((l) => l.achieved == 0)
    };
}

function detectarNuevosLogros(prev = [], current = []){
    if (!Array.isArray(prev) || !Array.isArray(current)) {
        return [];
    }


    const prevMap = new Map(
        prev.map(l => [l.id, l.achieved === 1])
    );

    return current.filter(l =>
        l.achieved === 1 && prevMap.get(l.id) === false
    );
}

function obtenUltimoLogro(desbloqueados, count){
    return desbloqueados.slice(0, count);
}

// ===ENDPOINT PRINCIPAL===

app.get("/api/steam/achievements", async (req, res) => {
    try{

        const STEAM_ID = req.query.steamid;
        const STEAM_KEY = req.query.steamkey;
        const LANGUAGE = req.query.language;
        const count = Number(req.query.numeroLogros || 3);

        const now = Date.now();

        if(cache[STEAM_ID] && now - cache[STEAM_ID].lastUpdate < CACHE_TIME){
            return res.json(cache[STEAM_ID].data);
        }

        const juego = await obtenJuegoActual(STEAM_KEY, STEAM_ID);

        //console.log(juego);

        if(!juego){
            const idle ={
                active: false,
                message: "Ready to Monitor",
            };

            cache[STEAM_ID] = {lastUpdate: now, data: idle}
            return res.json(idle);
        }

        const playtime = await obtenerTiempoDeJuego(juego.appid, STEAM_KEY, STEAM_ID);
        const logros = await obtenLogros(juego.appid, STEAM_KEY, STEAM_ID, LANGUAGE);
        const esquema = await obtenerEsquema(juego.appid, STEAM_KEY, LANGUAGE);
        const desbloqueado = logros.filter((a) => a.achieved == 1).length;
        const total = logros.length;
        //const ultimoLogro = obtenUltimoLogro(logros, esquema, count);

        const estadoActual = normalizarLogros(logros, esquema);

        const {desbloqueados, bloqueados} = clasificarLogros(estadoActual);

        console.log(bloqueados);

        const ultimos = obtenUltimoLogro(desbloqueados, count)

        const nuevos = detectarNuevosLogros(estadoAnterior, estadoActual);

        estadoAnterior = estadoActual;

        const payload = {
            active: true,
            game:{
                id: juego.appid,
                name: juego.name,
                image: `https://cdn.cloudflare.steamstatic.com/steam/apps/${juego.appid}/header.jpg`,
                libraryHero: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${juego.appid}/library_hero.jpg`,
                verticalCover: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${juego.appid}/library_600x900_2x.jpg`,
                timePlayed: playtime,
            },
            progress:{
                desbloqueado,
                total,
                percentage: total ? Math.round((desbloqueado/total) * 100) : 0,
            },
            lastAchievements: ultimos || {
                name: "No recent achievements",
                image: "https://widget.chemita.dev/steam-tracker/resource/steam_logo.jpg",
            },
            newAchievements: nuevos,
            blockedAchievementsCount: bloqueados.length,
            blockedAchievementsData: bloqueados
        };

        cache[STEAM_ID] = {lastUpdate: now, data: payload, estadoAnterior: estadoActual};

        res.json(payload);
    }catch(error){
        console.error("Steam Error:", error);
        res.status(500).json({
            active: false,
            message: "Error Fetching Steam",
        });
    }
});

app.listen(process.env.PORT, () => {
  console.log("Steam Widget Backend running on port", process.env.PORT);
});