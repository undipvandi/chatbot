<?php
// api.php - Backend Proxy for LLM Chat Completions API

// Set error reporting to suppress HTML error output in API response
error_reporting(E_ALL);
ini_set('display_errors', '0');

// Handle OPTIONS preflight request if needed
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Content-Type: application/json');
    http_response_code(405);
    echo json_encode(['error' => ['message' => 'Method not allowed. Use POST.']]);
    exit;
}

// Read JSON input
$inputRaw = file_get_contents('php://input');
$data = json_decode($inputRaw, true);

if (!$data || !is_array($data)) {
    header('Content-Type: application/json');
    http_response_code(400);
    echo json_encode(['error' => ['message' => 'Invalid JSON request body.']]);
    exit;
}

$baseUrl = isset($data['baseUrl']) ? trim($data['baseUrl']) : '';
$apiKey = isset($data['apiKey']) ? trim($data['apiKey']) : '';
$payload = isset($data['payload']) && is_array($data['payload']) ? $data['payload'] : null;

if (empty($baseUrl)) {
    header('Content-Type: application/json');
    http_response_code(400);
    echo json_encode(['error' => ['message' => 'Base URL (baseUrl) is required.']]);
    exit;
}

if (empty($apiKey)) {
    header('Content-Type: application/json');
    http_response_code(400);
    echo json_encode(['error' => ['message' => 'API Key (apiKey) is required.']]);
    exit;
}

if (empty($payload)) {
    header('Content-Type: application/json');
    http_response_code(400);
    echo json_encode(['error' => ['message' => 'Payload is required.']]);
    exit;
}

// Build full endpoint URL
$targetUrl = rtrim($baseUrl, '/');
if (!preg_match('/\/chat\/completions$/i', $targetUrl)) {
    $targetUrl .= '/chat/completions';
}

$isStream = !empty($payload['stream']);

// Disable script execution timeout for long streaming
@set_time_limit(0);
@ini_set('max_execution_time', '0');

// Disable output buffering & compression for SSE streaming
if ($isStream) {
    @ini_set('zlib.output_compression', 'Off');
    @ini_set('output_buffering', 'Off');
    @ob_implicit_flush(true);
    while (ob_get_level() > 0) {
        @ob_end_flush();
    }
}

// Initialize cURL
$ch = curl_init();

$headers = [
    'Content-Type: application/json',
    'Authorization: Bearer ' . $apiKey
];

curl_setopt($ch, CURLOPT_URL, $targetUrl);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
curl_setopt($ch, CURLOPT_TIMEOUT, 300);

$headersSent = false;

curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($curl, $chunk) use (&$headersSent, $isStream) {
    if (!$headersSent) {
        $httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
        if ($httpCode) {
            http_response_code($httpCode);
        }

        if ($isStream && $httpCode >= 200 && $httpCode < 300) {
            header('Content-Type: text/event-stream; charset=utf-8');
            header('Cache-Control: no-cache, no-transform');
            header('Connection: keep-alive');
            header('X-Accel-Buffering: no');
            header('Content-Encoding: none');
        } else {
            header('Content-Type: application/json; charset=utf-8');
        }
        $headersSent = true;
    }

    echo $chunk;
    if (ob_get_level() > 0) {
        @ob_flush();
    }
    flush();

    return strlen($chunk);
});

$result = curl_exec($ch);

if ($result === false) {
    $errorMsg = curl_error($ch);
    $errorCode = curl_errno($ch);
    curl_close($ch);

    if (!$headersSent) {
        header('Content-Type: application/json');
        http_response_code(502);
        echo json_encode(['error' => ['message' => "cURL error ({$errorCode}): {$errorMsg}"]]);
    } else if ($isStream) {
        echo "\ndata: " . json_encode(['error' => ['message' => "cURL streaming error ({$errorCode}): {$errorMsg}"]]) . "\n\n";
        echo "data: [DONE]\n\n";
        if (ob_get_level() > 0) @ob_flush();
        flush();
    }
    exit;
}

curl_close($ch);
