const fs = require("fs");
const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");
const chalk = require("chalk");

const API_URL = "https://pro-api.animix.tech/public/pet/mix";

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function countdown(seconds) {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r${chalk.cyan('Cooldown:')} ${chalk.yellow(String(i).padStart(2, '0'))} `);
    await delay(1000);
  }
  process.stdout.write("\r");
}

async function getPublicIP(agent) {
  try {
    const res = await axios.get("https://api.ipify.org?format=json", {
      httpAgent: agent,
      httpsAgent: agent,
      timeout: 5000
    });
    return res.data.ip;
  } catch {
    return "Gagal ambil IP";
  }
}

// ==== LOAD FILE ====

let config = {};
if (fs.existsSync("config.json")) {
  config = JSON.parse(fs.readFileSync("config.json", "utf-8"));
}

const tgInitDataList = fs.readFileSync("query.txt", "utf-8")
  .split("\n").map(line => line.trim()).filter(Boolean);

let proxyList = [];
if (fs.existsSync("proxies.txt")) {
  proxyList = fs.readFileSync("proxies.txt", "utf-8")
    .split("\n").map(p => p.trim()).filter(Boolean);
}

const dnaSource = JSON.parse(fs.readFileSync("dna.json", "utf-8"));
const availableDna = dnaSource.result.map(p => ({
  dna_id: p.dna_id,
  name: p.name,
  can_mom: p.can_mom,
  star: p.star
}));

const mixedPets = JSON.parse(fs.readFileSync("pets.json", "utf-8"));
const usedDnaIds = new Set();
mixedPets.result.forEach(p => {
  const idStr = String(p.pet_id);
  if (idStr.length >= 6) {
    usedDnaIds.add(parseInt(idStr.slice(0, 3)));
    usedDnaIds.add(parseInt(idStr.slice(3, 6)));
  }
});

function shouldMixPet(star) {
  return config[`show_star_${star}`] === true;
}

const unusedDna = availableDna.filter(p => shouldMixPet(p.star));

function getAllPairs(arr) {
  const pairs = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      pairs.push([arr[i], arr[j]]);
    }
  }
  return pairs;
}

const dnaPairs = getAllPairs(unusedDna);

if (dnaPairs.length === 0) {
  console.log(chalk.red("❌ Tidak ada pasangan DNA yang tersedia untuk digabung."));
  process.exit();
} else {
  console.log(chalk.cyanBright(`Total DNA pairs to mix: ${dnaPairs.length}`));
}

let successfulMixCount = 0;

async function mixDNA() {
  for (let idx = 0; idx < tgInitDataList.length; idx++) {
    const tgInitData = tgInitDataList[idx];
    const shortQueryId = tgInitData.match(/query_id=([^&]+)/)?.[1] || "Unknown";

    const proxy = proxyList.length > 0 ? proxyList[idx % proxyList.length] : null;
    const agent = proxy ? new HttpsProxyAgent(proxy) : null;

    let ipInfo = "";
    if (agent) {
      const ip = await getPublicIP(agent);
      ipInfo = chalk.gray(` (via proxy: ${ip})`);
    }

    console.log(chalk.blueBright(`\n👤 Mixing for Account: ${shortQueryId}`) + ipInfo);

    for (const [dna1, dna2] of dnaPairs) {
      let mom, dad;
      if (dna1.can_mom && !dna2.can_mom) {
        mom = dna1;
        dad = dna2;
      } else if (!dna1.can_mom && dna2.can_mom) {
        mom = dna2;
        dad = dna1;
      } else if (dna1.can_mom && dna2.can_mom) {
        mom = dna2;
        dad = dna1;
      } else {
        continue;
      }

      if (config.skip_existing_pet !== false) {
        if (usedDnaIds.has(dad.dna_id) && usedDnaIds.has(mom.dna_id)) {
          continue;
        }
      }

      try {
        const response = await axios.post(API_URL, {
          dad_id: dad.dna_id,
          mom_id: mom.dna_id
        }, {
          headers: {
            "Content-Type": "application/json",
            "Origin": "https://tele-game-v213.animix.tech",
            "Referer": "https://tele-game-v213.animix.tech/",
            "User-Agent": "Mozilla/5.0",
            "tg-init-data": tgInitData
          },
          ...(agent && { httpAgent: agent, httpsAgent: agent })
        });

        const res = response.data;

        if (res.result?.pet?.name && res.result.pet.pet_id) {
          successfulMixCount++;
          console.log(
            chalk.red(`Dad: ${dad.dna_id} | Mom: ${mom.dna_id}`) + " " +
            chalk.green(`→ New Pet: ${res.result.pet.name} (ID: ${res.result.pet.pet_id})`)
          );
        } else {
          console.log(
            chalk.red(`Dad: ${dad.dna_id} | Mom: ${mom.dna_id}`) + " " +
            chalk.yellow("→ Pet tidak ada")
          );
        }

      } catch (err) {
        console.log(
          chalk.red(`Dad: ${dad.dna_id} | Mom: ${mom.dna_id}`) + " " +
          chalk.yellow("→ Pet tidak ada")
        );
      }

      const delaySec = Math.floor(Math.random() * 5) + 1;
      await countdown(delaySec);
    }
  }

  if (successfulMixCount === 0) {
    console.log(chalk.redBright("\n❌ Tidak ada pet yang berhasil dibuat dari seluruh kombinasi."));
    process.exit();
  }
}

mixDNA();
