/* =====================================================
   AMANDATUR - SISTEMA DE RESERVAS INTELIGENTES
   SCRIPT.JS COMPLETO

   Funções:
   - Mapa de poltronas Double Decker (andar superior e inferior)
   - Seleção de viagem e poltrona por data
   - Modal de solicitação de reserva
   - Formulário com campos principais obrigatórios
     e campos complementares opcionais (CPF, deficiência, remédios)
   - Envio de solicitação para WhatsApp
   - Envio de payload para Google Apps Script (Google Sheets)
   - Envio de payload para n8n (automação + Evolution API)
   - Status estruturado: PENDENTE → confirmação manual pela equipe
   - Configuração de lembretes automáticos (via n8n/backend)
   - Botão flutuante do WhatsApp

   IMPORTANTE:
   - A reserva NÃO é confirmada automaticamente pelo site.
   - O status inicial de toda solicitação é PENDENTE.
   - A Evolution API é chamada pelo n8n ou backend, NUNCA pelo frontend.
   - Lembretes só são enviados para reservas com status CONFIRMADA.
===================================================== */


/* =====================================================
   CONFIGURAÇÕES PRINCIPAIS
===================================================== */

const WHATSAPP_EMPRESA = "5544998224499";

// URL do Google Apps Script para salvar no Google Sheets
// Preencha após configurar o Apps Script
const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzPlhF10vhI8hykNRv4kum96lY6UsZewfBt7tUXOWonIEjf4vF5N14lb6OnBGIZbu45Uw/exec";

// URL do webhook n8n para automação e Evolution API
// A Evolution API deve ser chamada pelo n8n, NUNCA exposta aqui
const N8N_WEBHOOK_URL = "";

const EMPRESA = "AMANDATUR";
const ROTA = "Cianorte → São Paulo / Brás";
const VALOR = "R$200";
const ORIGEM_LEAD = "Página de Reservas AMANDATUR";


/* =====================================================
   HORÁRIOS DA VIAGEM
   Editável: ajuste os horários conforme necessário
===================================================== */

const TRIP_SCHEDULES = {
  "Quarta-feira": "19h00",  // Altere o horário conforme a programação
  "Domingo":      "19h00",  // Altere o horário conforme a programação
};


/* =====================================================
   STATUS DE RESERVA
   Estrutura para Google Sheets, n8n e Evolution API
===================================================== */

const RESERVATION_STATUS = {
  PENDENTE:   "PENDENTE",    // Solicitação recebida, aguardando análise
  EM_ANALISE: "EM_ANALISE", // Equipe está analisando
  CONFIRMADA: "CONFIRMADA", // Confirmada pela equipe — lembrete pode ser enviado
  CANCELADA:  "CANCELADA",  // Cancelada
  REMARCADA:  "REMARCADA",  // Remarcada para outra data
};


/* =====================================================
   CONFIGURAÇÃO DE LEMBRETES AUTOMÁTICOS

   IMPORTANTE: Lembretes são processados pelo n8n/backend.
   O frontend envia apenas os dados e o status inicial.
   O n8n usa Evolution API para enviar mensagens WhatsApp.
   Lembretes SÓ são enviados para reservas com status CONFIRMADA.
===================================================== */

const REMINDER_CONFIG = {
  ativo: true,               // true = habilitado | false = desabilitado
  antecedencias_horas: [72, 24, 3], // Lembrete 72h, 24h e 3h antes da viagem
  // Para personalizar: edite o array acima. Ex: [48, 12, 1]
  // O n8n calcula a hora exata com base em dataViagem + horario
};


const EMPRESA_CONFIG = {
  empresa: EMPRESA,
  rota: ROTA,
  valor: VALOR,
  origem: ORIGEM_LEAD,
};


/* =====================================================
   ESTADO DO SISTEMA
===================================================== */

let selectedTrip = "Quarta-feira";
let selectedSeat = null;
let selectedDeck = null;

// Poltronas ocupadas: carregadas dinamicamente da planilha por data+viagem
let reservedSeats = [];

const LOAD_RESERVED_SEATS_FROM_SHEETS = true;


/* =====================================================
   MAPA DO ÔNIBUS DOUBLE DECKER
===================================================== */

const upperDeckMap = [
  [1, 2, null, 3, 4],
  [5, 6, null, 7, 8],
  [9, 10, null, 11, 12],
  [13, 14, null, 15, 16],
  [17, 18, null, 19, 20],
  [21, 22, null, 23, 24],
  [25, 26, null, 27, 28],
  [29, 30, null, 31, 32],
  [33, 34, null, 35, 36]
];

const lowerDeckMap = [
  [37, 38, null, 39, 40],
  [41, 42, null, 43, 44],
  [45, 46, null, 47, 48],
  [49, 50, null, 51, 52],
  [null, null, null, 53, 54]
];


/* =====================================================
   ELEMENTOS DO HTML
===================================================== */

let upperDeckSeats;
let lowerDeckSeats;

let travelCards;
let selectedTripText;

let reservationModal;
let closeModalButton;

let modalSeatNumber;
let modalTripDay;
let modalTripTime;

let reservationForm;

let clientNameInput;
let clientWhatsappInput;
let clientCityInput;
let travelDateInput;
let clientNotesInput;

let clientCpfInput;
let clientDisabilityInput;
let clientMedicationInput;
let clientHealthNotesInput;
let clientConsentInput;

let toast;
let floatingWhatsapp;


/* =====================================================
   INICIALIZAÇÃO
===================================================== */

document.addEventListener("DOMContentLoaded", async function () {
  cacheElements();
  setupIcons();
  setupMinimumDate();
  setupTripSelection();
  setupDateListener();      // Escuta mudança de data para rebuscar poltronas
  setupModalEvents();
  setupFormSubmit();
  setupFloatingWhatsapp();
  setupInputMasks();
  setupCurrentYear();
  lockHorizontalScroll();

  // Se houver data pré-selecionada ao carregar, busca poltronas imediatamente
  if (LOAD_RESERVED_SEATS_FROM_SHEETS) {
    const initialDate = travelDateInput ? travelDateInput.value : "";
    if (initialDate) {
      await fetchAndRenderReservedSeats(initialDate, selectedTrip);
    } else {
      renderAllSeats();
    }
  } else {
    renderAllSeats();
  }
});


/* =====================================================
   CAPTURAR ELEMENTOS
===================================================== */

function cacheElements() {
  upperDeckSeats = document.getElementById("upperDeckSeats");
  lowerDeckSeats = document.getElementById("lowerDeckSeats");

  travelCards = document.querySelectorAll(".travel-card");
  selectedTripText = document.getElementById("selectedTripText");

  reservationModal = document.getElementById("reservationModal");
  closeModalButton = document.getElementById("closeModal");

  modalSeatNumber = document.getElementById("modalSeatNumber");
  modalTripDay = document.getElementById("modalTripDay");
  modalTripTime = document.getElementById("modalTripTime");

  reservationForm = document.getElementById("reservationForm");

  clientNameInput = document.getElementById("clientName");
  clientWhatsappInput = document.getElementById("clientWhatsapp");
  clientCityInput = document.getElementById("clientCity");
  travelDateInput = document.getElementById("travelDate");
  clientNotesInput = document.getElementById("clientNotes");

  clientCpfInput = document.getElementById("clientCpf");
  clientDisabilityInput = document.getElementById("clientDisability");
  clientMedicationInput = document.getElementById("clientMedication");
  clientHealthNotesInput = document.getElementById("clientHealthNotes");
  clientConsentInput = document.getElementById("clientConsent");

  toast = document.getElementById("toast");
  floatingWhatsapp = document.getElementById("floatingWhatsapp");
}


/* =====================================================
   ÍCONES
===================================================== */

function setupIcons() {
  if (window.lucide) {
    lucide.createIcons();
  }
}


/* =====================================================
   ANO AUTOMÁTICO NO RODAPÉ
===================================================== */

function setupCurrentYear() {
  const currentYear = document.getElementById("currentYear");

  if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
  }
}


/* =====================================================
   TRAVA DE ROLAGEM LATERAL
===================================================== */

function lockHorizontalScroll() {
  document.documentElement.style.overflowX = "hidden";
  document.body.style.overflowX = "hidden";

  window.addEventListener("resize", function () {
    document.documentElement.style.overflowX = "hidden";
    document.body.style.overflowX = "hidden";
  });
}


/* =====================================================
   DATA MÍNIMA
===================================================== */

function setupMinimumDate() {
  if (!travelDateInput) return;

  const today = new Date();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  travelDateInput.min = `${year}-${month}-${day}`;
}


/* =====================================================
   SELEÇÃO DA VIAGEM
===================================================== */

function setupTripSelection() {
  if (!travelCards || travelCards.length === 0) return;

  travelCards.forEach(function (card) {
    card.addEventListener("click", function () {
      travelCards.forEach(function (item) {
        item.classList.remove("active");
      });

      card.classList.add("active");

      selectedTrip = card.dataset.trip || "Quarta-feira";

      if (selectedTripText) {
        selectedTripText.textContent = selectedTrip;
      }

      if (modalTripDay) {
        modalTripDay.textContent = selectedTrip;
      }

      if (modalTripTime) {
        modalTripTime.textContent = TRIP_SCHEDULES[selectedTrip] || "A confirmar";
      }

      showToast(`Viagem de ${selectedTrip} selecionada.`);

      // Rebusca poltronas ao trocar de viagem (Quarta-feira ↔ Domingo)
      if (LOAD_RESERVED_SEATS_FROM_SHEETS) {
        const currentDate = travelDateInput ? travelDateInput.value : "";
        if (currentDate) {
          fetchAndRenderReservedSeats(currentDate, selectedTrip);
        }
      }
    });
  });
}


/* =====================================================
   LISTENER DE DATA
   Rebusca poltronas sempre que o usuário muda a data
===================================================== */

function setupDateListener() {
  if (!travelDateInput) return;

  travelDateInput.addEventListener("change", function () {
    const selectedDate = travelDateInput.value;

    if (selectedDate && LOAD_RESERVED_SEATS_FROM_SHEETS) {
      fetchAndRenderReservedSeats(selectedDate, selectedTrip);
    }
  });
}


/* =====================================================
   RENDERIZAR POLTRONAS
===================================================== */

function renderAllSeats() {
  if (!upperDeckSeats || !lowerDeckSeats) {
    console.error("Erro: containers das poltronas não encontrados no HTML.");
    return;
  }

  upperDeckSeats.innerHTML = "";
  lowerDeckSeats.innerHTML = "";

  renderDeck(upperDeckSeats, upperDeckMap, "Superior");
  renderDeck(lowerDeckSeats, lowerDeckMap, "Inferior");

  setupIcons();
}


function renderDeck(container, deckMap, deckName) {
  deckMap.forEach(function (row) {
    const rowElement = document.createElement("div");
    rowElement.className = "seat-row";

    row.forEach(function (seatNumber, index) {
      if (index === 2) {
        const aisle = document.createElement("div");
        aisle.className = "bus-aisle";
        aisle.innerHTML = "<span></span>";
        rowElement.appendChild(aisle);
        return;
      }

      if (seatNumber === null) {
        const emptySeat = document.createElement("div");
        emptySeat.className = "bus-seat empty-seat";
        rowElement.appendChild(emptySeat);
        return;
      }

      const seatButton = createSeatButton(seatNumber, deckName);
      rowElement.appendChild(seatButton);
    });

    container.appendChild(rowElement);
  });
}


function createSeatButton(seatNumber, deckName) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "bus-seat";
  button.textContent = formatSeatNumber(seatNumber);

  button.dataset.seat = String(seatNumber);
  button.dataset.deck = deckName;

  button.setAttribute("aria-label", `Poltrona ${seatNumber}, andar ${deckName}`);

  if (reservedSeats.includes(Number(seatNumber))) {
    button.classList.add("reserved");
    button.disabled = true;
    button.title = "Poltrona já reservada";
    button.setAttribute("aria-disabled", "true");
  } else {
    button.title = `Reservar poltrona ${seatNumber}`;
    button.addEventListener("click", function () {
      selectSeat(seatNumber, deckName);
    });
  }

  return button;
}


function formatSeatNumber(number) {
  return String(number).padStart(2, "0");
}


/* =====================================================
   SELECIONAR POLTRONA
===================================================== */

function selectSeat(seatNumber, deckName) {
  selectedSeat = Number(seatNumber);
  selectedDeck = deckName;

  document.querySelectorAll(".bus-seat").forEach(function (seat) {
    seat.classList.remove("selected");
  });

  const currentSeat = document.querySelector(`.bus-seat[data-seat="${seatNumber}"]`);

  if (currentSeat) {
    currentSeat.classList.add("selected");
  }

  openReservationModal();
}


/* =====================================================
   MODAL
===================================================== */

function setupModalEvents() {
  if (!reservationModal || !closeModalButton) return;

  closeModalButton.addEventListener("click", function () {
    closeReservationModal();
  });

  reservationModal.addEventListener("click", function (event) {
    if (event.target === reservationModal) {
      closeReservationModal();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeReservationModal();
    }
  });
}


function openReservationModal() {
  if (!reservationModal) return;

  if (modalSeatNumber) {
    modalSeatNumber.textContent = formatSeatNumber(selectedSeat);
  }

  if (modalTripDay) {
    modalTripDay.textContent = selectedTrip;
  }

  if (modalTripTime) {
    modalTripTime.textContent = TRIP_SCHEDULES[selectedTrip] || "A confirmar";
  }

  reservationModal.classList.add("active");
  reservationModal.setAttribute("aria-hidden", "false");

  document.body.classList.add("modal-open");

  setTimeout(function () {
    if (clientNameInput) {
      clientNameInput.focus();
    }
  }, 250);
}


function closeReservationModal() {
  if (!reservationModal) return;

  reservationModal.classList.remove("active");
  reservationModal.setAttribute("aria-hidden", "true");

  document.body.classList.remove("modal-open");
}


/* =====================================================
   FORMULÁRIO
===================================================== */

function setupFormSubmit() {
  if (!reservationForm) return;

  reservationForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const reservationData = getReservationData();

    const isValid = validateReservation(reservationData);

    if (!isValid) return;

    setSubmitButtonLoading(true);

    showToast("Abrindo WhatsApp para enviar sua solicitação...");

    openWhatsApp(reservationData);

    sendReservationToIntegrationsFast(reservationData);

    console.log("[AMANDATUR] Solicitação enviada com status:", RESERVATION_STATUS.PENDENTE);
    console.log("[AMANDATUR] Dados da solicitação:", JSON.stringify(reservationData, null, 2));

    setTimeout(function () {
      setSubmitButtonLoading(false);
      reservationForm.reset();
      closeReservationModal();
    }, 600);
  });
}


/* =====================================================
   PEGAR DADOS DA RESERVA
===================================================== */

function getReservationData() {
  const horarioViagem = TRIP_SCHEDULES[selectedTrip] || "A confirmar";

  return {
    // ─── Dados da empresa e rota ─────────────────────────────────
    empresa: EMPRESA,
    rota:    ROTA,
    valor:   VALOR,

    // ─── Dados da viagem ─────────────────────────────────────────
    viagem:     selectedTrip,
    horario:    horarioViagem,
    andar:      selectedDeck,
    poltrona:   selectedSeat,
    dataViagem: travelDateInput ? travelDateInput.value : "",

    // ─── Dados obrigatórios do passageiro ────────────────────────
    nome:     clientNameInput     ? clientNameInput.value.trim()          : "",
    whatsapp: clientWhatsappInput ? onlyNumbers(clientWhatsappInput.value) : "",
    cidade:   clientCityInput     ? clientCityInput.value.trim()          : "",

    // ─── Dados opcionais (saúde e identificação) ─────────────────
    cpf:               clientCpfInput        ? onlyNumbers(clientCpfInput.value)   : "",
    possuiDeficiencia: clientDisabilityInput  ? clientDisabilityInput.value         : "",
    tomaRemedio:       clientMedicationInput  ? clientMedicationInput.value         : "",
    cuidadosViagem:    clientHealthNotesInput ? clientHealthNotesInput.value.trim() : "",

    // ─── Observações gerais ──────────────────────────────────────
    observacoes:   clientNotesInput   ? clientNotesInput.value.trim() : "",
    consentimento: clientConsentInput ? clientConsentInput.checked    : false,

    // ─── Status e rastreamento ───────────────────────────────────
    status:                 RESERVATION_STATUS.PENDENTE,
    status_label:           "Aguardando confirmação da equipe AMANDATUR",
    aguardando_confirmacao: true,
    origem:                 ORIGEM_LEAD,
    criadoEm:               new Date().toISOString(),

    // ─── Configuração de lembretes (processada pelo n8n) ─────────
    lembrete_ativo:         REMINDER_CONFIG.ativo,
    lembrete_antecedencias: REMINDER_CONFIG.antecedencias_horas,
    // IMPORTANTE: Lembretes SÓ são enviados quando status = CONFIRMADA

    // ─── Metadados ───────────────────────────────────────────────
    userAgent: navigator.userAgent,
    pagina:    window.location.href
  };
}


/* =====================================================
   VALIDAÇÃO
===================================================== */

function validateReservation(data) {
  // ─── Verificação de duplicidade client-side ───────────────────────────
  // Evita o envio se a poltrona já consta como ocupada na consulta atual
  if (data.poltrona && reservedSeats.includes(Number(data.poltrona))) {
    showToast("⚠️ Essa poltrona já está reservada para esta data e viagem. Por favor, escolha outra.");
    closeReservationModal();
    return false;
  }

  // ─── Campos obrigatórios ─────────────────────────────────────────────

  if (!data.poltrona) {
    showToast("Escolha uma poltrona antes de continuar.");
    return false;
  }

  if (!data.nome || data.nome.length < 3) {
    showToast("Preencha seu nome completo.");
    if (clientNameInput) clientNameInput.focus();
    return false;
  }

  if (!data.whatsapp || data.whatsapp.length < 10 || data.whatsapp.length > 13) {
    showToast("Preencha um WhatsApp válido com DDD. Ex: 44999999999");
    if (clientWhatsappInput) clientWhatsappInput.focus();
    return false;
  }

  if (!data.cidade || data.cidade.length < 2) {
    showToast("Preencha sua cidade de embarque.");
    if (clientCityInput) clientCityInput.focus();
    return false;
  }

  if (!data.dataViagem) {
    showToast("Escolha a data da viagem.");
    if (travelDateInput) travelDateInput.focus();
    return false;
  }

  if (!data.consentimento) {
    showToast("Autorize o envio dos dados para continuar.");
    if (clientConsentInput) clientConsentInput.focus();
    return false;
  }

  // ─── CPF, deficiência e remédio são OPCIONAIS ────────────────────────
  // Validação de CPF apenas se preenchido
  if (data.cpf && data.cpf.length > 0 && data.cpf.length !== 11) {
    showToast("CPF inválido. Digite os 11 números ou deixe em branco.");
    if (clientCpfInput) clientCpfInput.focus();
    return false;
  }

  return true;
}


/* =====================================================
   FORMATADORES
===================================================== */

function onlyNumbers(value) {
  return String(value || "").replace(/\D/g, "");
}


function formatDateBR(dateString) {
  if (!dateString) return "";

  const parts = dateString.split("-");

  if (parts.length !== 3) return dateString;

  const year = parts[0];
  const month = parts[1];
  const day = parts[2];

  return `${day}/${month}/${year}`;
}


function formatWhatsappInput(value) {
  return onlyNumbers(value).slice(0, 13);
}


function formatCpfInput(value) {
  return onlyNumbers(value).slice(0, 11);
}


/* =====================================================
   MÁSCARAS DE INPUT
===================================================== */

function setupInputMasks() {
  document.addEventListener("input", function (event) {
    if (event.target && event.target.id === "clientWhatsapp") {
      event.target.value = formatWhatsappInput(event.target.value);
    }

    if (event.target && event.target.id === "clientCpf") {
      event.target.value = formatCpfInput(event.target.value);
    }
  });
}


/* =====================================================
   BOTÃO LOADING
===================================================== */

function setSubmitButtonLoading(isLoading) {
  const button = reservationForm
    ? reservationForm.querySelector(".submit-button")
    : null;

  if (!button) return;

  if (isLoading) {
    button.disabled = true;
    button.dataset.originalText = button.innerHTML;
    button.innerHTML = `
      Enviando solicitação...
      <span class="button-loader"></span>
    `;
  } else {
    button.disabled = false;

    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
    }

    setupIcons();
  }
}


/* =====================================================
   WHATSAPP
===================================================== */

function openWhatsApp(data) {
  const message = createWhatsAppMessage(data);
  const encodedMessage = encodeURIComponent(message);

  const url = `https://wa.me/${WHATSAPP_EMPRESA}?text=${encodedMessage}`;

  window.open(url, "_blank");
}


function createWhatsAppMessage(data) {
  // Campos opcionais: mostrar apenas se preenchidos
  const cpfLine          = data.cpf            ? `\n🪪 *CPF:* ${data.cpf}` : "";
  const deficienciaLine  = data.possuiDeficiencia ? `\n♿ *Possui deficiência:* ${data.possuiDeficiencia}` : "";
  const remedioLine      = data.tomaRemedio     ? `\n💊 *Toma algum remédio:* ${data.tomaRemedio}` : "";
  const cuidadosLine     = data.cuidadosViagem  ? `\n🧾 *Cuidados importantes:* ${data.cuidadosViagem}` : "";
  const obsLine          = data.observacoes     ? `\n📝 *Observações:* ${data.observacoes}` : "";

  return `
Olá! Vim pelo site da AMANDATUR e gostaria de fazer uma *solicitação de reserva*.

━━━━━━━━━━━━━━━━━━━━━
🚌 *SOLICITAÇÃO DE RESERVA*
⏳ *Status:* PENDENTE — aguardando confirmação
━━━━━━━━━━━━━━━━━━━━━

📍 *Empresa:* ${data.empresa}
🛣️ *Rota:* ${data.rota}
📅 *Saída:* ${data.viagem}
⏰ *Horário previsto:* ${data.horario}
🗓️ *Data da viagem:* ${formatDateBR(data.dataViagem)}
🏢 *Andar:* ${data.andar}
💺 *Poltrona solicitada:* ${formatSeatNumber(data.poltrona)}
💰 *Valor:* ${data.valor}

━━━━━━━━━━━━━━━━━━━━━
👤 *Dados do passageiro*
━━━━━━━━━━━━━━━━━━━━━

👤 *Nome:* ${data.nome}
📲 *WhatsApp:* ${data.whatsapp}
🏙️ *Cidade:* ${data.cidade}${cpfLine}${deficienciaLine}${remedioLine}${cuidadosLine}${obsLine}

━━━━━━━━━━━━━━━━━━━━━

⚠️ *Esta é uma solicitação de reserva.* A poltrona fica reservada somente após confirmação da equipe AMANDATUR pelo WhatsApp.

Poderia verificar a disponibilidade e confirmar minha reserva?
`.trim();
}


/* =====================================================
   BOTÃO FLUTUANTE WHATSAPP
===================================================== */

function setupFloatingWhatsapp() {
  if (!floatingWhatsapp) return;

  floatingWhatsapp.addEventListener("click", function (event) {
    event.preventDefault();

    const message = `
Olá, vim pelo site da AMANDATUR.

Quero informações sobre as viagens de Cianorte para São Paulo / Brás.

Pode me passar os dias disponíveis, horário de saída, local de embarque e como funciona a reserva?
`.trim();

    const encodedMessage = encodeURIComponent(message);
    const url = `https://wa.me/${WHATSAPP_EMPRESA}?text=${encodedMessage}`;

    window.open(url, "_blank");
  });
}


/* =====================================================
   ENVIO RÁPIDO PARA INTEGRAÇÕES
===================================================== */

function sendReservationToIntegrationsFast(data) {
  const payload = JSON.stringify(data);

  if (GOOGLE_APPS_SCRIPT_URL && GOOGLE_APPS_SCRIPT_URL.trim() !== "") {
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], {
          type: "text/plain;charset=utf-8"
        });

        navigator.sendBeacon(GOOGLE_APPS_SCRIPT_URL, blob);
      } else {
        fetch(GOOGLE_APPS_SCRIPT_URL, {
          method: "POST",
          mode: "no-cors",
          headers: {
            "Content-Type": "text/plain;charset=utf-8"
          },
          body: payload,
          keepalive: true
        });
      }
    } catch (error) {
      console.error("Erro ao enviar para Google Apps Script:", error);
    }
  }

  if (N8N_WEBHOOK_URL && N8N_WEBHOOK_URL.trim() !== "") {
    try {
      fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: payload,
        keepalive: true
      });
    } catch (error) {
      console.error("Erro ao enviar para N8N:", error);
    }
  }
}


/* =====================================================
   ENVIO TRADICIONAL PARA INTEGRAÇÕES
===================================================== */

async function sendReservationToIntegrations(data) {
  const tasks = [];

  if (N8N_WEBHOOK_URL && N8N_WEBHOOK_URL.trim() !== "") {
    tasks.push(sendToN8N(data));
  }

  if (GOOGLE_APPS_SCRIPT_URL && GOOGLE_APPS_SCRIPT_URL.trim() !== "") {
    tasks.push(sendToGoogleAppsScript(data));
  }

  if (tasks.length === 0) {
    console.log("Nenhuma integração configurada ainda.");
    console.log("Dados da reserva:", data);
    return;
  }

  try {
    await Promise.allSettled(tasks);
  } catch (error) {
    console.error("Erro geral nas integrações:", error);
  }
}


async function sendToN8N(data) {
  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    console.log("Enviado para N8N. Status:", response.status);

    return response;
  } catch (error) {
    console.error("Erro ao enviar para N8N:", error);
  }
}


async function sendToGoogleAppsScript(data) {
  try {
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(data)
    });

    console.log("Enviado para Google Apps Script.");

    return response;
  } catch (error) {
    console.error("Erro ao enviar para Google Apps Script:", error);
  }
}


/* =====================================================
   BUSCAR E RENDERIZAR POLTRONAS RESERVADAS

   Critério de bloqueio: data_viagem + viagem + poltrona
   A mesma poltrona PODE ser reservada em datas diferentes.
   O que NÃO pode: mesma poltrona, mesma data, mesma viagem.
===================================================== */

/**
 * Função central: busca poltronas ocupadas para a combinação
 * dataViagem (YYYY-MM-DD) + viagem (ex: "Quarta-feira") e
 * re-renderiza o mapa de poltronas com os bloqueios corretos.
 */
async function fetchAndRenderReservedSeats(dataViagem, viagem) {
  if (!GOOGLE_APPS_SCRIPT_URL || GOOGLE_APPS_SCRIPT_URL.trim() === "") {
    console.warn("[AMANDATUR] Google Apps Script URL não configurada.");
    reservedSeats = [];
    renderAllSeats();
    return;
  }

  if (!dataViagem || !viagem) {
    reservedSeats = [];
    renderAllSeats();
    return;
  }

  try {
    const url = `${GOOGLE_APPS_SCRIPT_URL}?action=getReservedSeats` +
                `&dataViagem=${encodeURIComponent(dataViagem)}` +
                `&viagem=${encodeURIComponent(viagem)}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data && data.success && Array.isArray(data.reservedSeats)) {
      reservedSeats = data.reservedSeats.map(function (seat) {
        return Number(seat);
      });

      console.log(
        "[AMANDATUR] Poltronas ocupadas em",
        dataViagem, "/", viagem + ":",
        reservedSeats.length > 0 ? reservedSeats : "nenhuma"
      );
    } else {
      console.warn("[AMANDATUR] Retorno inesperado do getReservedSeats:", data);
      reservedSeats = [];
    }
  } catch (error) {
    console.error("[AMANDATUR] Erro ao consultar poltronas da planilha:", error);
    reservedSeats = [];
  }

  // Redesenha o mapa com bloqueios atualizados
  renderAllSeats();
}


/**
 * Compatibilidade: chama fetchAndRenderReservedSeats com data e viagem atuais.
 * Use sempre fetchAndRenderReservedSeats(data, viagem) diretamente quando possível.
 */
async function loadReservedSeatsFromGoogleSheets() {
  const date = travelDateInput ? travelDateInput.value : "";
  await fetchAndRenderReservedSeats(date, selectedTrip);
}


/* =====================================================
   TOAST
===================================================== */

function showToast(message) {
  if (!toast) {
    alert(message);
    return;
  }

  const toastText = toast.querySelector("span");

  if (toastText) {
    toastText.textContent = message;
  }

  toast.classList.add("active");

  clearTimeout(showToast.timeout);

  showToast.timeout = setTimeout(function () {
    toast.classList.remove("active");
  }, 2800);
}


/* =====================================================
   MOBILE UX
===================================================== */

window.addEventListener("orientationchange", function () {
  setTimeout(function () {
    window.scrollTo(0, window.scrollY);
  }, 300);
});


document.addEventListener("touchmove", function () {
  if (window.scrollX !== 0) {
    window.scrollTo(0, window.scrollY);
  }
}, { passive: true });


/* =====================================================
   FUNÇÕES FUTURAS
===================================================== */

function markSeatAsReserved(seatNumber) {
  const seat = document.querySelector(`.bus-seat[data-seat="${seatNumber}"]`);

  if (!seat) return;

  seat.classList.remove("selected");
  seat.classList.add("reserved");
  seat.disabled = true;
  seat.title = "Poltrona reservada";
}


function clearSelectedSeat() {
  selectedSeat = null;
  selectedDeck = null;

  document.querySelectorAll(".bus-seat").forEach(function (seat) {
    seat.classList.remove("selected");
  });
}