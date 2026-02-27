// ================= LIBRERÍAS =================
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BMP280.h>
#include <TinyGPS++.h>
#include <Adafruit_PN532.h>
#include "HX711.h"
#include <EEPROM.h>

// ================= HX711 =================
#define DT 25
#define SCK 26
#define UMBRAL_ACTIVACION 300.0
#define UMBRAL_CAIDA 400.0
#define UMBRAL_RETORNO 150.0

HX711 balanza;
float factor_calibracion;
bool calibrado = false;
bool pesoActivo = false;
float ultimoPeso = 0;

// ================= PINS BMP280 =================
#define SDA_PIN 19
#define SCL_PIN 21
#define BMP_ADDRESS 0x76
#define SEALEVELPRESSURE_HPA 1013.25

Adafruit_BMP280 bmp;

// ================= PN532 =================
Adafruit_PN532 nfc(SDA_PIN, SCL_PIN);

// ================= PINS GPS =================
#define RXD2 16
#define TXD2 17

HardwareSerial neogps(1);
TinyGPSPlus gps;

// ================= WiFi =================
const char* WIFI_SSID = "A36D";
const char* WIFI_PASSWORD = "12345678";

// ================= Firebase =================
const char* API_KEY = "AIzaSyCzbr7xVWPI__gHan0C0AuVcjm4EWJLSOw";
const char* DATABASE_URL = "https://smartsafe-backpack-default-rtdb.firebaseio.com/";
const char* USER_EMAIL = "esp32@test.com";
const char* USER_PASSWORD = "1234567";

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// ================= PROTOTIPOS =================
void setupWiFi();
void setupFirebase();
bool esperarHX711();

bool esperarHX711() {
  unsigned long inicio = millis();
  while (!balanza.is_ready()) {
    if (millis() - inicio > 5000) return false;
  }
  return true;
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  delay(1000);

  setupWiFi();
  setupFirebase();

  Wire.begin(SDA_PIN, SCL_PIN);

  if (!bmp.begin(BMP_ADDRESS)) while (1);

  nfc.begin();
  delay(500);
  if (nfc.getFirmwareVersion()) nfc.SAMConfig();

  neogps.begin(9600, SERIAL_8N1, RXD2, TXD2);

  Serial.println("Iniciando HX711...");
  EEPROM.begin(512);
  balanza.begin(DT, SCK);

  if (esperarHX711()) {
    EEPROM.get(0, factor_calibracion);
    if (factor_calibracion != 0 && !isnan(factor_calibracion)) {
      balanza.set_scale(factor_calibracion);
      delay(5000);
      balanza.tare();
      delay(1000);
      balanza.tare();
      calibrado = true;
      Serial.println("HX711 BLOQUEADO EN 0");
    }
  }

  Serial.println("Sistema iniciado");
}

// ================= LOOP =================
void loop() {

  // Leer GPS durante 500ms para capturar tramas NMEA completas
  unsigned long gpsStart = millis();
  while (millis() - gpsStart < 500) {
    while (neogps.available()) {
      gps.encode(neogps.read());
    }
  }

  // ================= HX711 =================
  float peso = 0;

  if (calibrado && balanza.is_ready()) {
    float lectura = balanza.get_units(6);
    if (lectura < 0) lectura = 0;

    if (!pesoActivo && lectura > UMBRAL_ACTIVACION) {
      pesoActivo = true;
    }

    if (pesoActivo) {
      if ((ultimoPeso - lectura) > UMBRAL_CAIDA) {
        pesoActivo = false;
        balanza.tare();
        lectura = 0;
      } else if (lectura < UMBRAL_RETORNO) {
        pesoActivo = false;
        balanza.tare();
        lectura = 0;
      }
      peso = pesoActivo ? lectura : 0;
    } else {
      peso = 0;
    }
    ultimoPeso = lectura;
  }

  // ================= NFC =================
  uint8_t uid[7];
  uint8_t uidLength;
  bool tarjetaDetectada = false;
  String uidString = "---";

  if (nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 100)) {
    tarjetaDetectada = true;
    uidString = "";
    for (uint8_t i = 0; i < uidLength; i++) {
      uidString += String(uid[i], HEX);
      if (i < uidLength - 1) uidString += ":";
    }
  }

  // ================= BMP280 =================
  float temperatura = bmp.readTemperature();
  float presion     = bmp.readPressure() / 100.0F;
  float altitudBMP  = bmp.readAltitude(SEALEVELPRESSURE_HPA);

  // ================= GPS =================
  int   satellites  = gps.satellites.value();
  bool  gpsFix      = gps.location.isValid();
  float latitude    = gpsFix ? gps.location.lat()    : 0.0;
  float longitude   = gpsFix ? gps.location.lng()    : 0.0;
  float speed       = gpsFix ? gps.speed.kmph()      : 0.0;
  float altitudeGPS = gpsFix ? gps.altitude.meters() : 0.0;

  unsigned long heartbeat = millis();
  bool envioOK = false;

  // ================= FIREBASE =================
  if (Firebase.ready()) {

    // GPS - una sola escritura JSON
    FirebaseJson gpsJson;
    gpsJson.set("latitud",   latitude);
    gpsJson.set("longitud",  longitude);
    gpsJson.set("velocidad", speed);
    gpsJson.set("satelites", satellites);
    gpsJson.set("altitud",   altitudeGPS);
    gpsJson.set("fix",       gpsFix);
    gpsJson.set("heartbeat", (int)heartbeat);
    Firebase.RTDB.setJSON(&fbdo, "/GPS", &gpsJson);

    // BMP280 - una sola escritura JSON
    FirebaseJson bmpJson;
    bmpJson.set("temperatura", temperatura);
    bmpJson.set("presion",     presion);
    bmpJson.set("altitud",     altitudBMP);
    bmpJson.set("lastUpdate",  (int)heartbeat);
    Firebase.RTDB.setJSON(&fbdo, "/BMP280", &bmpJson);

    // NFC - una sola escritura JSON
// NFC - una sola escritura JSON
FirebaseJson nfcJson;
nfcJson.set("detectada", tarjetaDetectada);
nfcJson.set("UID",       tarjetaDetectada ? uidString : "---");
nfcJson.set("lastScan",  tarjetaDetectada ? (int)heartbeat : 0);
nfcJson.set("heartbeat", (int)heartbeat); // 🔥 Heartbeat propio del NFC
Firebase.RTDB.setJSON(&fbdo, "/NFC", &nfcJson);

    // HX711 - una sola escritura JSON
    FirebaseJson hxJson;
    hxJson.set("peso",       peso);
    hxJson.set("activo",     pesoActivo);
    hxJson.set("calibrado",  calibrado);
    hxJson.set("lastUpdate", (int)heartbeat);
    Firebase.RTDB.setJSON(&fbdo, "/HX711", &hxJson);

    envioOK = true;
  }

  // ================= SERIAL =================
  Serial.println("--------------------------------------------");
  Serial.print("GPS | FIX: ");
  Serial.print(gpsFix ? "SI" : "NO");
  Serial.print(" | SAT: ");
  Serial.print(satellites);
  Serial.print(" | LAT: ");
  Serial.print(latitude, 6);
  Serial.print(" | LNG: ");
  Serial.println(longitude, 6);
  Serial.print("BMP | Temp: ");
  Serial.print(temperatura, 1);
  Serial.print("C | Presion: ");
  Serial.print(presion, 1);
  Serial.print(" hPa | Alt: ");
  Serial.print(altitudBMP, 1);
  Serial.println(" m");
  Serial.print("HX711 | Peso: ");
  Serial.print(peso, 1);
  Serial.print(" g | Estado: ");
  Serial.println(pesoActivo ? "ACTIVO" : "REPOSO");
  Serial.print("NFC | ");
  Serial.println(tarjetaDetectada ? "Tarjeta: " + uidString : "Sin tarjeta");
  Serial.print("Firebase | ");
  Serial.println(envioOK ? "Envio OK" : "ERROR");
  Serial.println("--------------------------------------------");

  delay(1500);
}

// ================= FUNCIONES =================
void setupWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  Serial.println("WiFi conectado");
}

void setupFirebase() {
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;
  config.token_status_callback = tokenStatusCallback;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}