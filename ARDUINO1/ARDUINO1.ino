// ================= LIBRERÍAS =================
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BMP280.h>
#include <TinyGPS++.h>
#include <Adafruit_PN532.h>
#include <EEPROM.h>

// ================= PINS BMP280 =================
#define SDA_PIN 22
#define SCL_PIN 23
#define BMP_ADDRESS 0x76
#define SEALEVELPRESSURE_HPA 1013.25

Adafruit_BMP280 bmp;

// ================= PN532 =================
#define SDA_PIN2 19
#define SCL_PIN2 21

TwoWire I2C_NFC = TwoWire(1);
Adafruit_PN532 nfc(SDA_PIN2, SCL_PIN2, &I2C_NFC);

// ================= PINS GPS =================
#define RXD2 16
#define TXD2 17

HardwareSerial neogps(1);
TinyGPSPlus gps;

// ================= WiFi =================
const char* WIFI_SSID = "Maria_Eugenia_Rea";
const char* WIFI_PASSWORD = "este06dieg087";

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

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  delay(1000);

  setupWiFi();
  setupFirebase();

  Wire.begin(SDA_PIN, SCL_PIN);

  if (!bmp.begin(BMP_ADDRESS)) while (1);

  I2C_NFC.begin(SDA_PIN2, SCL_PIN2);
  nfc.begin();
  delay(500);
  if (nfc.getFirmwareVersion()) nfc.SAMConfig();

  neogps.begin(9600, SERIAL_8N1, RXD2, TXD2);

  Serial.println("Sistema iniciado");
}

// ================= LOOP =================
void loop() {

  // ================= GPS =================
  unsigned long gpsStart = millis();
  while (millis() - gpsStart < 500) {
    while (neogps.available()) {
      gps.encode(neogps.read());
    }
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

    FirebaseJson gpsJson;
    gpsJson.set("latitud",   latitude);
    gpsJson.set("longitud",  longitude);
    gpsJson.set("velocidad", speed);
    gpsJson.set("satelites", satellites);
    gpsJson.set("altitud",   altitudeGPS);
    gpsJson.set("fix",       gpsFix);
    gpsJson.set("heartbeat", (int)heartbeat);
    Firebase.RTDB.setJSON(&fbdo, "/GPS", &gpsJson);

    FirebaseJson bmpJson;
    bmpJson.set("temperatura", temperatura);
    bmpJson.set("presion",     presion);
    bmpJson.set("altitud",     altitudBMP);
    bmpJson.set("lastUpdate",  (int)heartbeat);
    Firebase.RTDB.setJSON(&fbdo, "/BMP280", &bmpJson);

    FirebaseJson nfcJson;
    nfcJson.set("detectada", tarjetaDetectada);
    nfcJson.set("UID",       tarjetaDetectada ? uidString : "---");
    nfcJson.set("lastScan",  tarjetaDetectada ? (int)heartbeat : 0);
    nfcJson.set("heartbeat", (int)heartbeat);
    Firebase.RTDB.setJSON(&fbdo, "/NFC", &nfcJson);

    envioOK = true;
  }

  // ================= SERIAL =================
  Serial.println("--------------------------------------------");

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