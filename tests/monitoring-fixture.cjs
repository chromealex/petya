// A Unity-like project for «Мониторинг» endpoint discovery tests, written to a temp folder at run time (the
// fake secrets are built from repeats so no token-shaped string is stored in the repository).
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const SECRET='k'.repeat(18)+'9'.repeat(14);
const PASSWORD='p'.repeat(6)+'4'.repeat(4);
const GUID_CLIENT='a'.repeat(16)+'1'.repeat(16),GUID_LOBBY='b'.repeat(16)+'2'.repeat(16);

const files={
 'Assets/Scripts/Net/ServerConfig.cs':`using System;
using System.Collections.Generic;
namespace Game.Net {
  public enum Env { Dev, Stage, Prod }
  public static class ServerConfig {
    public const string Scheme = "https";
    public const string ProdHost = "api.mygame.com";
    public static readonly string StageHost = "api.staging.mygame.com";
    public const int GamePort = 7777;
    public const string ApiVersion = "v2";
    // Concatenation of constants
    public static readonly string ProdApi = Scheme + "://" + ProdHost + "/" + ApiVersion;
    // Interpolation with a port
    public static string StageApi => $"https://{StageHost}:{GamePort}/{ApiVersion}";
    // Set at run time: stays a placeholder
    public static string RuntimeHost { get; set; }
    public static string RuntimeApi => $"https://{RuntimeHost}/api";
    public const string HealthPath = "/healthz";

#if PRODUCTION
    public const string Matchmaker = "wss://mm.mygame.com/ws";
#elif STAGING
    public const string Matchmaker = "wss://mm.staging.mygame.com/ws";
#else
    public const string Matchmaker = "ws://localhost:9000/ws";
#endif

    public static string BaseFor(Env env) {
      switch (env) {
        case Env.Prod: return "https://api.mygame.com";
        case Env.Stage: return "https://gw.mygame.net/stage";
        case Env.Dev: return "http://10.0.0.15:8080";
      }
      return null;
    }

    public static string Cdn(Env env) => env switch {
      Env.Prod => "https://cdn.mygame.com/bundles",
      Env.Stage => "https://cdn-stage.mygame.com/bundles",
      _ => ""
    };

    public static readonly Dictionary<Env, string> Events = new Dictionary<Env, string> {
      { Env.Prod, "https://events.mygame.com/collect" },
      { Env.Dev, "https://ev.mygame.io/collect" },
    };
  }
}
`,
 'Assets/Scripts/Net/ApiClient.cs':`using System;
using System.IO;
using UnityEngine;
public class ApiClient : MonoBehaviour {
  [SerializeField] private string baseUrl = "https://api.mygame.com";
  [SerializeField] string leaderboardUrl = "https://lb.mygame.com";
  public int timeoutSeconds = 10;
  private string LoginUrl => baseUrl + "/auth/login";
  private void Start() {
    var profile = string.Format("{0}://{1}/{2}/profile", Game.Net.ServerConfig.Scheme, Game.Net.ServerConfig.ProdHost, Game.Net.ServerConfig.ApiVersion);
    var status = new Uri(new Uri(Game.Net.ServerConfig.ProdApi), "status");
    var ping = new UriBuilder("https", Game.Net.ServerConfig.StageHost, Game.Net.ServerConfig.GamePort, "/ping").Uri;
    var verbatim = @"https://verbatim.mygame.com/path";
    var raw = """https://raw.mygame.com/v1""";
    var saves = Path.Combine(Game.Net.ServerConfig.ProdApi, "saves");
    var shop = $@"https://shop.mygame.com/{Game.Net.ServerConfig.ApiVersion}/items";
#if UNITY_EDITOR
    var editorOnly = "http://localhost:5000/debug";
#endif
#if DEVELOPMENT_BUILD
    var devBuild = "https://qa-tools.mygame.com/upload";
#endif
  }
}
`,
 'Assets/Scripts/Net/ApiClient.cs.meta':'fileFormatVersion: 2\nguid: '+GUID_CLIENT+'\n',
 'Assets/Scripts/Net/Lobby.cs':`public class Lobby : UnityEngine.MonoBehaviour {
  [UnityEngine.SerializeField] private string lobbyHost = "lobby.mygame.com";
  public const int LobbyPort = 7000;
}
`,
 'Assets/Scripts/Net/Lobby.cs.meta':'fileFormatVersion: 2\nguid: '+GUID_LOBBY+'\n',
 'Assets/Scripts/Analytics/Sdk.cs':`public static class Sdk {
  public const string Amplitude = "https://api2.amplitude.com/2/httpapi";
  public const string AppsFlyer = "https://events.appsflyer.com/v1";
  public const string Docs = "https://docs.unity3d.com/Manual/index.html";
}
`,
 'Assets/Scenes/Main.unity':`%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!114 &1001
MonoBehaviour:
  m_ObjectHideFlags: 0
  m_Enabled: 1
  m_Script: {fileID: 11500000, guid: ${GUID_CLIENT}, type: 3}
  baseUrl: https://api.staging.mygame.com
  leaderboardUrl: https://lb.mygame.com
  timeoutSeconds: 20
`,
 'Assets/Prefabs/Lobby.prefab':`%YAML 1.1
--- !u!114 &2002
MonoBehaviour:
  m_Script: {fileID: 11500000, guid: ${GUID_LOBBY}, type: 3}
  lobbyHost: lobby-eu.mygame.com
`,
 'Assets/AddressableAssetsData/AddressableAssetSettings.asset':`%YAML 1.1
--- !u!114 &1
MonoBehaviour:
  m_Name: AddressableAssetSettings
  m_ProfileSettings:
    m_Profiles:
    - m_ProfileName: Production
      m_Values:
      - m_Id: remote
        m_Value: https://d111111abcdef8.cloudfront.net/[BuildTarget]
`,
 'Assets/Resources/config.prod.json':JSON.stringify({apiUrl:'https://api.mygame.com',telemetry:'https://api.mygame.com/v1/events?token='+SECRET+'&app=game',upload:'https://uploader:'+PASSWORD+'@ftp.mygame.com/upload'},null,2),
 'Assets/Resources/config.staging.json':JSON.stringify({apiUrl:'https://api.staging.mygame.com',healthPath:'/healthz'},null,2),
 'ProjectSettings/ProjectSettings.asset':`%YAML 1.1
--- !u!129 &1
PlayerSettings:
  productName: My Game
  scriptingDefineSymbols:
    Android: PRODUCTION;FIREBASE
    iPhone: STAGING
    Standalone:
  applicationIdentifier: {}
`,
 '.env.example':'API_URL=https://api.staging.mygame.com\nGAME_SERVER=game.mygame.com:7777\n',
 'Android/AndroidManifest.xml':'<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application><meta-data android:name="api" android:value="https://api.mygame.com"/></application></manifest>\n',
 'deploy/docker-compose.yml':'services:\n  game:\n    image: game-server\n    healthcheck:\n      test: ["CMD", "curl", "-f", "http://game-server:8080/health"]\n',
 'deploy/k8s/ingress.yaml':'apiVersion: networking.k8s.io/v1\nkind: Ingress\nspec:\n  rules:\n  - host: api.mygame.com\n',
 '.github/workflows/deploy.yml':'jobs:\n  smoke:\n    steps:\n    - run: curl -f https://api.mygame.com/healthz\n',
 '.gitignore':'Secrets/\n*.local.json\n',
 'Secrets/keys.json':'{"internal":"https://secret-admin.mygame.com"}\n',
 'Assets/Resources/override.local.json':'{"x":"https://ignored-local.mygame.com"}\n',
 'Library/cache.json':'{"x":"https://library.mygame.com"}\n',
 'node_modules/pkg/index.js':'fetch("https://npm-junk.example.net")\n'
};

function create(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-monitor-project-'));
 for(const [rel,text] of Object.entries(files)){const f=path.join(root,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,text);}
 // A binary file that happens to contain a URL: skipped.
 fs.writeFileSync(path.join(root,'Assets/Resources/blob.json'),Buffer.concat([Buffer.from([0,1,2,0]),Buffer.from('https://binary.mygame.com')]));
 return root;
}
module.exports={create,SECRET,PASSWORD,GUID_CLIENT,GUID_LOBBY};
