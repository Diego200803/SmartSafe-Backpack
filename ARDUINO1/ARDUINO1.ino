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

  // ===== HX711 =====
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

  while (neogps.available()) {
    gps.encode(neogps.read());
  }

  // ================= HX711 =================
  float peso = 0;

  if (calibrado && balanza.is_ready()) {

    float lectura = balanza.get_units(6);
    if (lectura < 0) lectura = 0;

    // Activar cuando hay peso real
    if (!pesoActivo && lectura > UMBRAL_ACTIVACION) {
      pesoActivo = true;
    }

    if (pesoActivo) {

      // Detectar caída brusca grande
      if ((ultimoPeso - lectura) > UMBRAL_CAIDA) {
        pesoActivo = false;
        balanza.tare();
        lectura = 0;
      }

      // Detectar retiro normal
      else if (lectura < UMBRAL_RETORNO) {
        pesoActivo = false;
        balanza.tare();
        lectura = 0;
      }

      peso = pesoActivo ? lectura : 0;
    }
    else {
      peso = 0;
    }

    ultimoPeso = lectura;
  }

  // ================= NFC =================
  uint8_t uid[7];
  uint8_t uidLength;
  bool tarjetaDetectada = false;
  String uidString = "";

  if (nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 100)) {
    tarjetaDetectada = true;
    for (uint8_t i = 0; i < uidLength; i++) {
      uidString += String(uid[i], HEX);
      if (i < uidLength - 1) uidString += ":";
    }
  }

  // ================= BMP280 =================
  float temperatura = bmp.readTemperature();
  float presion = bmp.readPressure() / 100.0F;
  float altitudBMP = bmp.readAltitude(SEALEVELPRESSURE_HPA);

  // ================= GPS =================
  int satellites = gps.satellites.value();
  bool gpsFix = gps.location.isValid();
  float latitude  = gps.location.lat();
  float longitude = gps.location.lng();
  float speed     = gps.speed.kmph();
  float altitudeGPS = gps.altitude.meters();

  unsigned long heartbeat = millis();
  bool envioOK = false;

  if (Firebase.ready()) {

    Firebase.RTDB.setFloat(&fbdo, "/BMP280/temperatura", temperatura);
    Firebase.RTDB.setFloat(&fbdo, "/BMP280/presion", presion);
    Firebase.RTDB.setFloat(&fbdo, "/BMP280/altitud", altitudBMP);
    Firebase.RTDB.setInt(&fbdo, "/BMP280/lastUpdate", heartbeat);

    Firebase.RTDB.setFloat(&fbdo, "/GPS/latitud", latitude);
    Firebase.RTDB.setFloat(&fbdo, "/GPS/longitud", longitude);
    Firebase.RTDB.setFloat(&fbdo, "/GPS/velocidad", speed);
    Firebase.RTDB.setInt(&fbdo, "/GPS/satelites", satellites);
    Firebase.RTDB.setFloat(&fbdo, "/GPS/altitud", altitudeGPS);
    Firebase.RTDB.setBool(&fbdo, "/GPS/fix", gpsFix);
    Firebase.RTDB.setInt(&fbdo, "/GPS/heartbeat", heartbeat);

    Firebase.RTDB.setBool(&fbdo, "/NFC/detectada", tarjetaDetectada);
    if (tarjetaDetectada) {
      Firebase.RTDB.setString(&fbdo, "/NFC/UID", uidString);
      Firebase.RTDB.setInt(&fbdo, "/NFC/lastScan", heartbeat);
    }

    Firebase.RTDB.setFloat(&fbdo, "/HX711/peso", peso);
    Firebase.RTDB.setBool(&fbdo, "/HX711/activo", pesoActivo);
    Firebase.RTDB.setBool(&fbdo, "/HX711/calibrado", calibrado);
    Firebase.RTDB.setInt(&fbdo, "/HX711/lastUpdate", heartbeat);

    envioOK = true;
  }

  // ================= SERIAL =================
  Serial.println("--------------------------------------------");
  Serial.println("⚖ HX711");
  Serial.print("   Peso: ");
  Serial.print(peso);
  Serial.println(" g");
  Serial.println("--------------------------------------------");

  Serial.println("Sensor BMP280");
  Serial.print("   Temperatura: ");
  Serial.println(temperatura);
  Serial.println("--------------------------------------------");

  Serial.println("NFC");
  if (tarjetaDetectada) {
    Serial.print("   UID: ");
    Serial.println(uidString);
  } else {
    Serial.println("   No hay tarjeta");
  }

  Serial.println("--------------------------------------------");
  Serial.print("Heartbeat: ");
  Serial.println(heartbeat);
  Serial.print("Envío FB: ");
  Serial.println(envioOK ? " OK" : " ERROR");
  Serial.println("============================================");

  delay(1000);
}

// ================= FUNCIONES =================
void setupWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(300);
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
