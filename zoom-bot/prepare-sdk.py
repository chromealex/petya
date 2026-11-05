"""Apply Petya's narrow recording adapter to the pinned official Zoom sample."""
import pathlib
import subprocess
import sys
root = pathlib.Path(sys.argv[1]).resolve()
expected = 'c10031ec1b901494f30d1c6e7d075b6da3f83718'
if subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip() != expected:
    raise SystemExit('Use the pinned Zoom sample revision: ' + expected)
def replace(name, old, new):
    file = root / name
    text = file.read_text()
    if old not in text:
        raise SystemExit('Unexpected upstream code: ' + name)
    file.write_text(text.replace(old, new))
replace('src/Zoom.cpp', 'param.isVideoOff = false;', 'param.isVideoOff = true;')
replace('src/Zoom.cpp', 'initParam.enableLogByDefault = true;', 'initParam.enableLogByDefault = false;')
replace('src/Zoom.cpp', 'initParam.enableGenerateDump = true;', 'initParam.enableGenerateDump = false;')
replace('src/Zoom.cpp', 'Log::info("writing audio raw data to " + m_audioSource->dir() + "/" + m_audioSource->filename());', 'std::cout << "PETYA:recording" << std::endl;')
replace('src/Zoom.h', 'recCtl->RequestLocalRecordingPrivilege();\n        }', 'recCtl->RequestLocalRecordingPrivilege();\n        } else { startRawRecording(); }')
replace('src/events/MeetingServiceEvent.cpp', 'Log::success("meeting ended");', 'std::cout << "PETYA:ended" << std::endl; std::exit(0);')
replace('src/events/MeetingServiceEvent.cpp', 'case MEETING_STATUS_FAILED:', 'case MEETING_STATUS_FAILED: std::exit(2);')
replace('src/events/MeetingServiceEvent.cpp', 'Log::info("waiting for the meeting to start");', 'std::cout << "PETYA:waiting" << std::endl;')
replace('src/raw_record/ZoomSDKAudioRawDataDelegate.cpp', '#include "ZoomSDKAudioRawDataDelegate.h"', '#include "ZoomSDKAudioRawDataDelegate.h"\n#include <unistd.h>\n#include <cstdint>\n#include <cstdlib>\n#include <cerrno>')
needle = 'void ZoomSDKAudioRawDataDelegate::writeToFile(const string &path, AudioRawData *data)\n{'
body = '''
    if (std::getenv("PETYA_RAW_PIPE")) {
        uint32_t header[2] = { static_cast<uint32_t>(data->GetSampleRate()), static_cast<uint32_t>(data->GetBufferLen()) };
        auto send = [](const void* buffer, size_t length) {
            auto bytes = static_cast<const char*>(buffer);
            while (length) { auto n = ::write(3, bytes, length); if(n < 0 && errno == EINTR) continue; if(n <= 0) std::_Exit(3); bytes += n; length -= n; }
        };
        send(header, sizeof(header)); send(data->GetBuffer(), data->GetBufferLen()); return;
    }
'''
replace('src/raw_record/ZoomSDKAudioRawDataDelegate.cpp', needle, needle + body)
print('Prepared official Zoom sample adapter. Compile against the licensed Linux SDK and verify in a real meeting before enabling auto-join.')
