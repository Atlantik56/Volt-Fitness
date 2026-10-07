# VOLT Health Bridge — Android companion

Минимальное Android-приложение для цепочки `Health Connect → VOLT backend`.
Оно только читает Health Connect и синхронизирует данные вручную. Прямого
Garmin API, записи в Health Connect, фонового планировщика, GPS-маршрутов и
преобразования Exercise Session в `workout_logs` здесь нет.

## Модули

- `core` — provider-neutral модели, stable external id, typed JSON и unit-тесты;
- `app` — официальный `androidx.health.connect`, permissions, нормализация,
  DataOrigin, диагностический экран, HTTPS-клиент и Android Keystore.

Токен устройства зашифрован AES-GCM ключом из Android Keystore. Серверный URL
должен быть HTTPS. Максимум одного запроса — 50 записей и 256 KB.

## Разрешения

Приложение запрашивает только чтение:

- `READ_HEART_RATE`
- `READ_RESTING_HEART_RATE`
- `READ_HEART_RATE_VARIABILITY`
- `READ_SLEEP`
- `READ_WEIGHT`
- `READ_EXERCISE`
- `READ_STEPS`
- `READ_TOTAL_CALORIES_BURNED`
- `READ_ACTIVE_CALORIES_BURNED`

`READ_HEALTH_DATA_HISTORY` показывается отдельной необязательной кнопкой только
если Health Connect сообщает поддержку feature. `READ_DISTANCE` не запрашивается,
поэтому `distanceMeters` в Sprint 1 остаётся `null`. Write/background/route
permissions отсутствуют.

## Сборка

Нужны JDK 17, Android SDK Platform 36 и Build Tools 36.0.0. Проект фиксирует
Gradle 8.11.1 и Android Gradle Plugin 8.9.1.

```bash
cd android/health-bridge
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools \
./gradlew --no-daemon :core:test :app:testDebugUnitTest :app:assembleDebug
```

APK после сборки:

```text
android/health-bridge/app/build/outputs/apk/debug/app-debug.apk
```

## Скачивание и установка

В личном кабинете VOLT: «Профиль → Интеграции и данные → Скачать APK».
GET `/api/health-connect/apk` требует действующую сессию. В релиз входит
зафиксированный debug APK из `releases/health-bridge/`; версия и SHA-256
хранятся в `lib/health-bridge-release.ts`. Файл включён в standalone tracing
и не размещён в public.

После скачивания откройте файл на телефоне и разрешите установку для
выбранного источника, если Android запросит её. Для проверки через USB:

1. На телефоне откройте «Настройки → О телефоне» и нажмите номер сборки 7 раз.
2. В параметрах разработчика включите USB debugging.
3. Подключите USB, выберите передачу файлов и подтвердите RSA-ключ компьютера.
4. Проверьте устройство и установите APK:

```bash
/opt/homebrew/share/android-commandlinetools/platform-tools/adb devices
/opt/homebrew/share/android-commandlinetools/platform-tools/adb install -r \
  android/health-bridge/app/build/outputs/apk/debug/app-debug.apk
```

Для обычного пользовательского релиза нужен отдельный release signing; debug APK
предназначен для Sprint 1 QA.

## Первая синхронизация

1. В Garmin Connect включите передачу нужных типов данных в Health Connect и
   дождитесь синхронизации часов с Garmin Connect.
2. В VOLT PWA откройте «Профиль и настройки → Интеграции и данные → Health
   Connect», создайте одноразовый код.
3. Вставьте код в Health Bridge и нажмите «Привязать телефон».
4. Выдайте базовые READ permissions. Полная история — отдельный необязательный
   запрос.
5. Нажмите «Синхронизировать сейчас».

Android получил именно Garmin-данные только если диагностика Health Bridge
показывает DataOrigin с Garmin, например package
`com.garmin.android.apps.connectmobile`. VOLT PWA показывает «Garmin Connect»
только после такого подтверждения; наличие одного Garmin Connect на телефоне
подтверждением не считается.

Серверная миграция перенесена на v33, с сохранением текущих миграций v21–v31. Повторные записи дедуплицируются; устаревшие версии не перезаписывают новые. Отозванное устройство проверяется повторно внутри транзакции ingestion. На телефоне можно сбросить локальную привязку и создать новую.
