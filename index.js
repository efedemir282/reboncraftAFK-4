const mineflayer = require('mineflayer');
const express = require('express');

// --- 1. RENDER PORT VE WEB SUNUCUSU ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.status(200).send('Kumarbaz_Sabri Minyon Besleme ve AFK Botu Active!');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Express] Web sunucusu ${PORT} portunda başlatıldı.`);
});

// --- 2. GLOBAL ÇÖKME KORUMALARI ---
process.on('uncaughtException', (err) => {
  if (err.name === 'PartialReadError' || err.message?.includes('PartialReadError') || err.message?.includes('FastDecoderException')) return;
  console.log('[Sistem Uyarısı] Hata:', err.message);
});

process.on('unhandledRejection', (reason) => {
  if (reason && (reason.name === 'PartialReadError' || reason.message?.includes('PartialReadError'))) return;
  console.log('[Sistem Uyarısı] Rejection:', reason);
});

// --- 3. BOT BİLGİLERİ VE YETKİLİ LİSTESİ ---
const AUTHORIZED_USERS = ['xbetray_31', 'xeregos'];
const BOT_USERNAME = 'Kumarbaz_Sabri';
const BOT_PASSWORD = 'efe438021';

let bot = null;
let afkInterval = null;
let kontrolInterval = null;
let isConnecting = false;
let activeTimeouts = [];

function safeTimeout(fn, delay) {
  const t = setTimeout(() => {
    fn();
    activeTimeouts = activeTimeouts.filter(item => item !== t);
  }, delay);
  activeTimeouts.push(t);
  return t;
}

function clearAllTimeouts() {
  activeTimeouts.forEach(t => clearTimeout(t));
  activeTimeouts = [];
}

function botuBaslat() {
  if (isConnecting) return;
  isConnecting = true;

  console.log(`${BOT_USERNAME} ile RebornCraft sunucusuna bağlanılıyor...`);

  try {
    bot = mineflayer.createBot({
      host: 'play.reborncraft.pw',
      port: 25565,
      username: BOT_USERNAME,
      version: '1.21.6',
      viewDistance: 'far',
      clientSettings: {
        locale: 'tr_TR',
        viewDistance: 'far',
        chatFlags: 0,
        chatColors: true,
        skinParts: 127,
        mainHand: 1
      },
      checkTimeoutInterval: 120 * 1000,
      physicsEnabled: true,
      hideErrors: true
    });
  } catch (err) {
    console.log('Bot başlatma hatası:', err.message);
    sifirlaVeYenidenBaslat();
    return;
  }

  function komutGonder(komut) {
    if (bot && bot._client && typeof bot.chat === 'function') {
      try {
        bot.chat(komut);
      } catch (e) {
        console.log('Komut hatası:', e.message);
      }
    }
  }

  // ENVANTER BOŞALTMA
  async function esyalariBosalt(gonderen) {
    if (!bot || !bot.inventory) return;

    const items = bot.inventory.items();
    if (items.length === 0) {
      komutGonder(`/msg ${gonderen} Envanterimde atılacak eşya yok!`);
      return;
    }

    komutGonder(`/msg ${gonderen} Envanterdeki tüm eşyalar yere atılıyor...`);

    for (const item of items) {
      try {
        await bot.tossStack(item);
        await new Promise(r => setTimeout(r, 250));
      } catch (err) {
        console.log('Eşya atma hatası:', err.message);
      }
    }

    komutGonder(`/msg ${gonderen} Tüm eşyalar başarıyla yere atıldı!`);
  }

  // OTOMATİK MİNYON BESLEME (KESİN HİTBOX VE ÇİFT TIKLAMA MANTIĞI)
  async function minyonBesle() {
    if (!bot || !bot.entity) return;

    console.log('>> [MİNYON BESLEME] Besleme işlemi başlatılıyor...');

    try {
      // 1. Menü Dinleyicisini Hazırla
      const menuListener = (window) => {
        console.log(`>> [MENÜ AÇILDI] Başlık: ${window.title || 'Minyon Paneli'}`);
        
        safeTimeout(() => {
          try {
            const TARGET_SLOT = 27; // Altın Elma Slotu
            bot.clickWindow(TARGET_SLOT, 0, 0);
            console.log(`>> [BESLEME BAŞARILI] 27. slottaki Altın Elma'ya basıldı!`);
          } catch (e) {
            console.log('Menü içi tıklama hatası:', e.message);
          }
        }, 1000);
      };

      bot.once('windowOpen', menuListener);

      // 2. Yakındaki Minyonu / Varlığı Bul
      const minyon = bot.nearestEntity(e => {
        if (!e) return false;
        const dist = bot.entity.position.distanceTo(e.position);
        return dist <= 4.0 && e.id !== bot.entity.id;
      });

      if (minyon) {
        // Minyona Bak ve Sağ Tıkla
        await bot.lookAt(minyon.position.offset(0, 1.0, 0), true);
        await new Promise(r => setTimeout(r, 300));
        
        bot.activateEntity(minyon);
        bot.swingArm('right');
        console.log(`>> [MİNYON] Yakındaki entity'ye (ID: ${minyon.id}) sağ tıklandı.`);
      } else {
        // Entity Bulunamadıysa Doğrudan Tam Karşıya / Baktığı Bloğa Sağ Tıkla
        console.log('>> [MİNYON] Belirgin entity bulunamadı, öndeki bloğa sağ tık atılıyor...');
        const targetBlock = bot.blockAtCursor(4);
        if (targetBlock) {
          await bot.lookAt(targetBlock.position, true);
          bot.activateBlock(targetBlock);
        }
        bot.swingArm('right');
      }

    } catch (err) {
      console.log('Minyon besleme hatası:', err.message);
    }
  }

  function sifirlaVeYenidenBaslat() {
    clearAllTimeouts();
    if (afkInterval) clearInterval(afkInterval);
    if (kontrolInterval) clearInterval(kontrolInterval);

    isConnecting = false;

    if (bot) {
      try { bot.quit(); } catch (e) {}
      bot = null;
    }

    console.log('Bağlantı koptu. 15 saniye sonra tekrar bağlanılacak...');
    setTimeout(botuBaslat, 15000);
  }

  // YETKİLİ MESAJ / KOMUT İŞLEME
  function msgKomutIsle(gonderen, mesajIcerik) {
    if (!gonderen) return;
    const gonderenTemiz = gonderen.replace(/[^a-zA-Z0-9_]/g, '');
    const gonderenLower = gonderenTemiz.toLowerCase();

    if (!AUTHORIZED_USERS.includes(gonderenLower)) {
      return;
    }

    const rawMessage = mesajIcerik.trim();
    const icerik = rawMessage.toLowerCase();
    console.log(`>> [YETKİLİ KOMUT] ${gonderenTemiz}: ${rawMessage}`);

    if (rawMessage.startsWith('!')) {
      const gonderilecekMesaj = rawMessage.substring(1).trim();
      if (gonderilecekMesaj.length > 0) {
        komutGonder(gonderilecekMesaj);
        console.log(`>> [GENEL CHAT] YAZILDI: ${gonderilecekMesaj}`);
      }
    }
    else if (icerik === 'tpa' || icerik === '/tpa') {
      komutGonder(`/tpa ${gonderenTemiz}`);
      console.log(`>> [TPA] /tpa ${gonderenTemiz} atıldı.`);
    } else if (icerik.startsWith('tpa ') || icerik.startsWith('/tpa ')) {
      const hedefKullanici = rawMessage.replace(/^\/?tpa\s+/, '').trim();
      komutGonder(`/tpa ${hedefKullanici}`);
      console.log(`>> [TPA] /tpa ${hedefKullanici} atıldı.`);
    }
    else if (icerik === 'bosalt' || icerik === 'boşalt') {
      esyalariBosalt(gonderenTemiz);
    }
    else if (icerik === 'home' || icerik === '/home') {
      komutGonder('/home');
      console.log(`>> [HOME] Bot /home çekti.`);
    }
    else if (icerik === 'besle') {
      minyonBesle();
    }
  }

  bot.on('whisper', (username, message) => {
    msgKomutIsle(username, message);
  });

  bot.on('message', (jsonMsg) => {
    const mesaj = jsonMsg.toString().trim();
    if (!mesaj) return;
    console.log(`[SUNUCU]: ${mesaj}`);

    const mesajLower = mesaj.toLowerCase();

    if (mesajLower.includes('size ışınlanmak istiyor') || (mesajLower.includes('tpa') && mesajLower.includes('kabul'))) {
      safeTimeout(() => komutGonder('/tpaccept'), 1000);
    }

    AUTHORIZED_USERS.forEach(user => {
      if (mesajLower.includes(user)) {
        const exclamationIndex = mesaj.indexOf('!');
        if (exclamationIndex !== -1) {
          const chatMsg = mesaj.substring(exclamationIndex + 1).trim();
          if (chatMsg) komutGonder(chatMsg);
        } else if (mesajLower.includes('tpa')) {
          komutGonder(`/tpa ${user}`);
        } else if (mesajLower.includes('bosalt') || mesajLower.includes('boşalt')) {
          esyalariBosalt(user);
        } else if (mesajLower.includes('home')) {
          komutGonder('/home');
        } else if (mesajLower.includes('besle')) {
          minyonBesle();
        }
      }
    });

    if (
      mesaj.includes('Lobiye aktarıldınız') ||
      mesaj.includes('Sunucu yeniden başlatılıyor')
    ) {
      komutGonder('/skyblock');
      safeTimeout(() => komutGonder('/home'), 6000);
    }
  });

  let spawnOldu = false;

  bot.on('spawn', () => {
    if (spawnOldu) return;
    spawnOldu = true;

    console.log(`>> ${BOT_USERNAME} oyuna bağlandı.`);

    safeTimeout(() => {
      komutGonder(`/login ${BOT_PASSWORD}`);
      console.log(`>> [1/3] /login ${BOT_PASSWORD} gönderildi.`);
    }, 4000);

    safeTimeout(() => {
      komutGonder('/skyblock');
      console.log('>> [2/3] Skyblock sunucusuna geçiş yapılıyor...');
    }, 10000);

    safeTimeout(() => {
      komutGonder('/home');
      console.log('>> [3/3] Minyon alanına (/home) çekildi.');
    }, 16000);

    // 22. saniyede ilk besleme denemesi
    safeTimeout(() => {
      minyonBesle();
    }, 22000);

    if (afkInterval) clearInterval(afkInterval);
    afkInterval = setInterval(() => {
      if (bot && bot.entity) {
        minyonBesle();
      }
    }, 30 * 60 * 1000);

    if (kontrolInterval) clearInterval(kontrolInterval);
    kontrolInterval = setInterval(() => {
      if (bot && bot.entity) {
        komutGonder('/home');
      }
    }, 15 * 60 * 1000);
  });

  bot.on('kicked', (reason) => {
    console.log('Bot sunucudan atıldı! Sebep:', JSON.stringify(reason));
    sifirlaVeYenidenBaslat();
  });

  bot.on('end', () => {
    console.log('Bağlantı koptu (end).');
    sifirlaVeYenidenBaslat();
  });

  bot.on('error', (err) => {
    if (err.name === 'PartialReadError' || err.message?.includes('PartialReadError') || err.message?.includes('timed out')) return;
    console.log('Hata oluştu:', err.message);
    sifirlaVeYenidenBaslat();
  });
}

botuBaslat();
