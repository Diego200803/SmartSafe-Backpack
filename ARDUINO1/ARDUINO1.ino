// ================= LIBRERÍAS =================
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BMP280.h>
#include <TinyGPS++.h>

// ================= PINS BMP280 =================
#define SDA_PIN 19
#define SCL_PIN 21
#define BMP_ADDRESS 0x76
#define SEALEVELPRESSURE_HPA 1013.25

Adafruit_BMP280 bmp;

// ================= PINS GPS =================
#define RXD2 16   // ESP32 RX <- GPS TX
#define TXD2 17   // ESP32 TX -> GPS RX

HardwareSerial neogps(1);
TinyGPSPlus gps;

// ================= WiFi =================
const char* WIFI_SSID = "Celerity_Sumiordenadores";
const char* WIFI_PASSWORD = "nicovale1234";

// ================= Firebase =================
const char* API_KEY = "AIzaSyCzbr7xVWPI__gHan0C0AuVcjm4EWJLSOw";
const char* DATABASE_URL = "https://smartsafe-backpack-default-rtdb.firebaseio.com/";
const char* USER_EMAIL = "esp32@test.com";
const char* USER_PASSWORD = "1234567";

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// ================= VARIABLES DE CONTROL =================
bool wifiConectado = false;
bool firebaseListo = false;
unsigned long lastPrint = 0;

// ================= PROTOTIPOS DE FUNCIONES =================
void setupWiFi();
void setupFirebase();

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  delay(1000);

  // ===== WiFi =====
  setupWiFi();

  // ===== Firebase =====
  setupFirebase();

  // ===== BMP280 =====
  Serial.println("Iniciando BMP280...");
  Wire.begin(SDA_PIN, SCL_PIN);

  if (!bmp.begin(BMP_ADDRESS)) {
    Serial.println("❌ No se encontró el BMP280");
    while (1); // Detener si falla
  }
  Serial.println("✅ BMP280 detectado correctamente");

  // ===== GPS =====
  Serial.println("Iniciando GPS...");
  neogps.begin(9600, SERIAL_8N1, RXD2, TXD2);

  Serial.println("✅ Sistema iniciado - Enviando cada 1 segundo");
}

// ================= LOOP =================
void loop() {
  // ===== LEER GPS CONTINUAMENTE =====
  while (neogps.available()) {
    gps.encode(neogps.read());
  }

  // ================= BMP280 =================
  float temperatura = bmp.readTemperature();
  float presion = bmp.readPressure() / 100.0F;
  float altitudBMP = bmp.readAltitude(SEALEVELPRESSURE_HPA);

  // ================= GPS - OBTENER VALORES =================
  // 🔥 Usar gps.satellites.value() SIEMPRE (con o sin fix)
  int satellites = gps.satellites.value();
  
  // 🔥 Verificar FIX GPS
  bool gpsFix = gps.location.isValid();
  
  // 🔥 Obtener coordenadas (siempre, incluso si son 0)
  float latitude  = gps.location.lat();
  float longitude = gps.location.lng();
  float speed     = gps.speed.kmph();
  float altitudeGPS = gps.altitude.meters();

  // 🔥 Heartbeat para detección en la app
  unsigned long heartbeat = millis();

  // ================= FIREBASE - ENVIAR DATOS =================
  bool envioOK = false;

  if (Firebase.ready()) {
    
    // ===== BMP280 =====
    Firebase.RTDB.setFloat(&fbdo, "/BMP280/temperatura", temperatura);
    Firebase.RTDB.setFloat(&fbdo, "/BMP280/presion", presion);
    Firebase.RTDB.setFloat(&fbdo, "/BMP280/altitud", altitudBMP);
    Firebase.RTDB.setInt(&fbdo, "/BMP280/lastUpdate", heartbeat);

    // ===== GPS - ENVIAR SIEMPRE (con o sin FIX) =====
    Firebase.RTDB.setFloat(&fbdo, "/GPS/latitud", latitude);
    Firebase.RTDB.setFloat(&fbdo, "/GPS/longitud", longitude);
    Firebase.RTDB.setFloat(&fbdo, "/GPS/velocidad", speed);
    Firebase.RTDB.setInt(&fbdo, "/GPS/satelites", satellites);
    Firebase.RTDB.setFloat(&fbdo, "/GPS/altitud", altitudeGPS);
    Firebase.RTDB.setBool(&fbdo, "/GPS/fix", gpsFix);           // 🔥 Estado de FIX
    Firebase.RTDB.setInt(&fbdo, "/GPS/heartbeat", heartbeat);   // 🔥 Para detección de conexión

    envioOK = true;
  }

  // ================= SERIAL MONITOR - CADA 1s =================
  if (millis() - lastPrint >= 1000) {
    lastPrint = millis();

    Serial.println("============================================");
    Serial.println("      ESTADO DEL SISTEMA - SmartSafe");
    Serial.println("============================================");

    // ===== WiFi =====
    Serial.print("WiFi:     ");
    Serial.println(wifiConectado ? "✅ Conectado" : "❌ Desconectado");

    // ===== Firebase =====
    Serial.print("Firebase: ");
    Serial.println(firebaseListo ? "✅ Listo" : "❌ No listo");

    Serial.println("--------------------------------------------");

    // ===== BMP280 =====
    Serial.println("📊 Sensor BMP280");
    Serial.print("   Temperatura: "); Serial.print(temperatura, 1); Serial.println(" °C");
    Serial.print("   Presión:     "); Serial.print(presion, 1); Serial.println(" hPa");
    Serial.print("   Altitud:     "); Serial.print(altitudBMP, 1); Serial.println(" m");

    Serial.println("--------------------------------------------");

    // ===== GPS =====
    Serial.println("📡 GPS");
    Serial.print("   Estado FIX:  ");
    
    if (gpsFix) {
      Serial.println("✅ FIX OBTENIDO");
      Serial.print("   Satélites:   "); Serial.println(satellites);
      Serial.print("   Latitud:     "); Serial.println(latitude, 6);
      Serial.print("   Longitud:    "); Serial.println(longitude, 6);
      Serial.print("   Velocidad:   "); Serial.print(speed, 1); Serial.println(" km/h");
      Serial.print("   Altitud GPS: "); Serial.print(altitudeGPS, 1); Serial.println(" m");
    } else {
      Serial.println("❌ BUSCANDO SEÑAL...");
      Serial.print("   Satélites detectados: "); Serial.println(satellites);
      
      if (satellites > 0) {
        Serial.println("   ⏳ Satélites visibles, esperando FIX...");
      } else {
        Serial.println("   📡 Buscando satélites...");
      }
    }

    Serial.println("--------------------------------------------");

    // ===== Heartbeat y Envío =====
    Serial.print("Heartbeat:   "); Serial.println(heartbeat);
    Serial.print("Envío a FB:  "); Serial.println(envioOK ? "✅ OK" : "❌ ERROR");

    Serial.println("============================================\n");
  }

  delay(1000);
}

// ================= FUNCIONES =================
void setupWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Conectando a WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(300);
  }

  Serial.println("\n✅ WiFi conectado");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());

  wifiConectado = true;
}

void setupFirebase() {
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;
  config.token_status_callback = tokenStatusCallback;

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  firebaseListo = true;
  Serial.println("✅ Firebase configurado");
}
