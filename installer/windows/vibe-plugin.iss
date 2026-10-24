; Vibe Plugin for Premiere Pro - Windows installer (Inno Setup 6).
; Build:  iscc /DAppVersion=1.0.0 installer\windows\vibe-plugin.iss
; Needs the staged panel folder first:  bash installer/stage.sh build/stage/com.vibeplugin

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#define AppName "Vibe Plugin"
#define Repo "https://github.com/naeem5877/vibe-plugin"

[Setup]
AppId={{6F3D8C52-1B7A-4E0C-9A44-2D5E7B91C0A3}
AppName={#AppName} for Premiere Pro
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Naeem
AppPublisherURL={#Repo}
AppSupportURL={#Repo}/issues
AppUpdatesURL={#Repo}/releases
VersionInfoVersion={#AppVersion}
; Per-user install: no admin prompt. This is the folder Premiere scans for CEP panels.
DefaultDirName={userappdata}\Adobe\CEP\extensions\com.vibeplugin
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
LicenseFile=..\..\LICENSE
SetupIconFile=vibe.ico
WizardStyle=modern
; One image per display-scaling step, so it stays sharp on HiDPI screens instead of being stretched.
WizardImageFile=wizard-100.bmp,wizard-125.bmp,wizard-150.bmp,wizard-175.bmp,wizard-200.bmp,wizard-225.bmp,wizard-250.bmp
WizardSmallImageFile=wizard-small-100.bmp,wizard-small-125.bmp,wizard-small-150.bmp,wizard-small-175.bmp,wizard-small-200.bmp,wizard-small-225.bmp,wizard-small-250.bmp
Compression=lzma2/max
SolidCompression=yes
OutputDir=..\..\dist-installer
OutputBaseFilename=vibe-plugin-v{#AppVersion}-windows-setup
; Keep the uninstaller out of the extension folder so Premiere only sees panel files.
UninstallFilesDir={localappdata}\VibePlugin\uninstall
UninstallDisplayIcon={uninstallexe}
CloseApplications=no
RestartIfNeededByRun=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
WelcomeLabel2=This installs the Vibe Plugin panel for Adobe Premiere Pro (2020 and newer).%n%nIt also turns on "unsigned panels" for your Windows account, which Premiere needs to load any open-source panel.%n%nPlease close Premiere Pro before you continue.
FinishedLabel=Vibe Plugin is installed.%n%nRestart Premiere Pro, then open  Window > Extensions > Vibe Plugin.

[Files]
Source: "..\..\build\stage\com.vibeplugin\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "vibe.ico"; DestDir: "{app}\icons"; Flags: ignoreversion

; Replace the panel's own folders on upgrade so removed files do not linger. Never touches anything else.
[InstallDelete]
Type: filesandordirs; Name: "{app}\js"
Type: filesandordirs; Name: "{app}\css"
Type: filesandordirs; Name: "{app}\jsx"
Type: filesandordirs; Name: "{app}\CSXS"

; Adobe only loads unsigned panels when PlayerDebugMode is on. Left in place on uninstall (other panels may rely on it).
[Registry]
Root: HKCU; Subkey: "Software\Adobe\CSXS.9";  ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.10"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.11"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.12"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
// install-dev.bat links this folder to a git checkout. Installing "through" that link would overwrite (and on
// upgrade delete) the developer's source files, so stop and explain instead.
function IsDevLink(): Boolean;
var
  Code: Integer;
begin
  Result := False;
  if Exec(ExpandConstant('{cmd}'),
          '/C dir /AL "' + ExpandConstant('{userappdata}') + '\Adobe\CEP\extensions" | find /I "com.vibeplugin"',
          '', SW_HIDE, ewWaitUntilTerminated, Code) then
    Result := (Code = 0);
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  if IsDevLink() then
  begin
    MsgBox('Vibe Plugin is already linked to a source folder (install-dev.bat).' + #13#10 + #13#10 +
           'Installing over it would overwrite your source files. Remove the link first:' + #13#10 +
           '  rmdir "%APPDATA%\Adobe\CEP\extensions\com.vibeplugin"', mbError, MB_OK);
    Result := False;
  end;
end;
