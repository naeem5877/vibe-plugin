// Premiere Pro host script (ExtendScript). Called from the panel via evalScript.
// Every function returns "OK|message", "WAIT|", or "ERR|message".

var VIBE_BIN = "Vibe Downloads";

function vibeNorm(p) {
    return String(p).replace(/\//g, "\\").toLowerCase();
}

function vibeFind(parent, p) {
    var want = vibeNorm(p);
    for (var i = 0; i < parent.children.numItems; i++) {
        var c = parent.children[i];
        if (c.type === 2) { // BIN
            var r = vibeFind(c, p);
            if (r) return r;
        } else {
            try {
                if (vibeNorm(c.getMediaPath()) === want) return c;
            } catch (e) {}
        }
    }
    return null;
}

function vibeBin(name) {
    var root = app.project.rootItem;
    for (var i = 0; i < root.children.numItems; i++) {
        var c = root.children[i];
        if (c.type === 2 && c.name === name) return c;
    }
    return root.createBin(name);
}

// Step 1: bring the file into the project (into the "Vibe Downloads" bin).
function vibeImport(p) {
    try {
        if (!app.project || !app.project.rootItem) return "ERR|Open or create a Premiere project first";
        var f = new File(p);
        if (!f.exists) return "ERR|File not found on disk";

        var item = vibeFind(app.project.rootItem, f.fsName);
        if (item) return "OK|Already in project (" + item.name + ")";

        var bin = vibeBin(VIBE_BIN);
        var ok = app.project.importFiles([f.fsName], true, bin, false);
        if (!ok) return "ERR|Premiere could not import this file (codec not supported?)";

        item = vibeFind(app.project.rootItem, f.fsName);
        if (!item) return "WAIT|"; // Premiere is still indexing; the panel retries
        return "OK|Imported to bin \"" + VIBE_BIN + "\"";
    } catch (e) {
        return "ERR|" + e.toString();
    }
}

function vibeTrackFree(track, s, e) {
    try { if (track.isLocked()) return false; } catch (x) {}
    for (var i = 0; i < track.clips.numItems; i++) {
        var c = track.clips[i];
        if (c.start.seconds < e - 0.001 && c.end.seconds > s + 0.001) return false;
    }
    return true;
}

// Step 2 (optional): put the clip at the playhead on the first track with free space.
function vibePlace(p, isAudio) {
    try {
        var seq = app.project.activeSequence;
        if (!seq) return "ERR|no active sequence is open";
        var item = vibeFind(app.project.rootItem, p);
        if (!item) return "ERR|clip is not in the project yet";

        var pos = seq.getPlayerPosition();
        var dur = 5;
        try { dur = item.getOutPoint().seconds - item.getInPoint().seconds; } catch (e) {}
        if (!(dur > 0)) dur = 5;

        var tracks = isAudio ? seq.audioTracks : seq.videoTracks;
        var idx = -1;
        for (var t = 0; t < tracks.numTracks; t++) {
            if (vibeTrackFree(tracks[t], pos.seconds, pos.seconds + dur)) { idx = t; break; }
        }
        var note = "";
        if (idx < 0) { idx = tracks.numTracks - 1; note = " (all tracks busy, overwrote the top one)"; }

        tracks[idx].overwriteClip(item, pos);
        return "OK|Placed on " + (isAudio ? "A" : "V") + (idx + 1) + " at playhead" + note;
    } catch (e) {
        return "ERR|" + e.toString();
    }
}
