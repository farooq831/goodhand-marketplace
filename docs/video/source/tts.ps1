# Generates one WAV per scene with the offline Windows voice.
Add-Type -AssemblyName System.Speech
$dir = "C:\Users\muham\gh-video"
New-Item -ItemType Directory -Force "$dir\audio" | Out-Null
$scenes = Get-Content "$dir\scenes.json" -Raw | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice("Microsoft David Desktop")
$synth.Rate = -1      # slightly slower than default, clearer for a walkthrough
$synth.Volume = 100
foreach ($s in $scenes) {
  $synth.SetOutputToWaveFile("$dir\audio\$($s.id).wav")
  $synth.Speak($s.text)
}
$synth.SetOutputToNull()
$synth.Dispose()
"generated $($scenes.Count) clips"
