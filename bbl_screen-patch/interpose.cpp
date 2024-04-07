/* bbl_screen interposer
 *
 * Copyright (c) 2023 - 2024 Joshua Wise, and the X1Plus authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// use a dirent64
#define _XOPEN_SOURCE
#define _FILE_OFFSET_BITS 64

#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <QtCore/QObject>
#include <QtCore/QSettings>
#include <QtQml/qqml.h>
#include <QtQml/qjsengine.h>
#include <QtQml/qjsvalue.h>
#include <QtCore/QFile>
#include <QtCore/QDir>
#include <QtCore/QFileInfo>
#include <string>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/fcntl.h>
#include <dirent.h>
#include <unistd.h>
#include <cmath>
#include <cstdio>
#include <sys/mman.h>
#include <dlfcn.h>
#include <QtCore/QtEndian>
#include <linux/wireless.h>

namespace X1Plus {
#include "minizip/ioapi.c"
#include "minizip/unzip.c"
}
using namespace X1Plus;

/* from OpenSSL */
extern "C" unsigned char *MD5(const unsigned char *d, unsigned long n, unsigned char *md);

#define SWIZZLE(rtype, name, ...) \
    extern "C" rtype name(__VA_ARGS__) { \
        rtype (*next)(__VA_ARGS__) = (rtype(*)(__VA_ARGS__))dlsym(RTLD_NEXT, #name); \

char qt_resourceFeatureZlib = 0;

int needs_emulation_workarounds = 0;

#if 0
void mocdump() {
    for (int tp = QMetaType::User; QMetaType::isRegistered(tp); tp++) {
        const char *tn = QMetaType::typeName(tp);
        if (strstr(tn, "QQml") || strstr(tn, "QQuick") || !strstr(tn, "*")) {
            continue;
        }
        const QMetaObject *mo = QMetaType::metaObjectForType(tp);
        if (!mo) {
            continue;
        }
        printf("%d == %s (%s)\n", tp, tn, mo->className());
        for (int m = mo->methodOffset(); m < mo->methodCount(); m++) {
            printf("  method: %s\n", mo->method(m).methodSignature().data());
        }
        for (int p = mo->propertyOffset(); p < mo->propertyCount(); p++) {
            printf("  property: %s %s\n", mo->property(p).typeName(), mo->property(p).name());
        }
        for (int e = mo->enumeratorOffset(); e < mo->enumeratorCount(); e++) {
            QMetaEnum me = mo->enumerator(e);
            printf("  enumerator: %s\n", me.enumName());
            for (int k = 0; k < me.keyCount(); k++) {
                printf("    %d: %s\n", me.value(k), me.key(k));
            }
        }
    }
}
#endif

class X1PlusNativeClass : public QObject {
    Q_OBJECT

public:
    X1PlusNativeClass(QObject *parent = 0) : QObject(parent) { }
    ~X1PlusNativeClass() {}
    
    Q_INVOKABLE QList<QString> listX1ps(QString path) {
        QList<QString> l;
        
        std::string pstr = path.toStdString();
        DIR *dir = opendir(pstr.c_str());
        if (!dir) {
            printf("listX1ps: failed to open %s\n", pstr.c_str());
            return l;
        }

        errno = 0;
        for (struct dirent *de = readdir(dir); de; de = readdir(dir)) {
            if ((de->d_type != DT_REG && de->d_type != DT_LNK) || (strlen(de->d_name) < 5) || strcmp(de->d_name + strlen(de->d_name) - 4, ".x1p"))
                continue;
            
            char *pathp;
            if (!asprintf(&pathp, "%s/%s", pstr.c_str(), de->d_name))
                continue;
            unzFile unz = unzOpen(pathp);
            free(pathp);
            int len;
            char *buf;
            
            if (!unz)
                continue;
            if (unzLocateFile(unz, "info.json", 2 /* not case sensitive */) != UNZ_OK)
                goto eject;
            if (unzOpenCurrentFile(unz) != UNZ_OK)
                goto eject;
            unz_file_info info;
            if (unzGetCurrentFileInfo(unz, &info, NULL, 0, NULL, 0, NULL, 0) != UNZ_OK)
                goto eject;
            
            len = info.uncompressed_size;
            buf = (char *)malloc(len + 1);
            if (!buf)
                goto eject;
            if (unzReadCurrentFile(unz, buf, len) != len) {
                free(buf);
                goto eject;
            }
            buf[len] = 0;
            
            l.push_back(QString(de->d_name));
            l.push_back(QString(buf));
            free(buf);
eject:
            unzClose(unz);
        }

        closedir(dir);
        
        return l;
    }

    /*** Miscellaneous chunks of I/O that are not otherwise exposed to QML in a straightforward fashion. ***/
    Q_INVOKABLE int system(QString string) {
        std::string str = string.toStdString();
        const char *s = str.c_str();
        printf("system(\"%s\")\n", s);
        return ::system(s);
    }

    Q_INVOKABLE QString popen(QString command){
    	std::string cmd = command.toStdString() + " 2>&1";
    	const char* c_cmd = cmd.c_str();
    	FILE* pipe = ::popen(c_cmd,"r");
    	if (!pipe) return "ERROR";
    	
    	char buffer[1024];
    	QString result = "";
    	while (fgets(buffer,sizeof(buffer), pipe) != NULL){
    		result +=buffer;
    	}
    	
    	pclose(pipe);
    	return result.trimmed();
    }

    Q_INVOKABLE QString getenv(QString string) {
        std::string ss = string.toStdString();
        const char *s = ::getenv(ss.c_str());
        if (s) {
            return QString(s);
        } else {
            return QString("");
        }
    }

    Q_INVOKABLE QString md5(const QByteArray &buf) {
        const unsigned char *md = ::MD5((const unsigned char *)buf.constData(), buf.size(), NULL);
        char str[16*2+1];
        for (int i = 0; i < 16; i++) {
            sprintf(str + i * 2, "%02x", md[i]);
        }
        return QString(str);
    }
    
    /* XHRs are not as reliable as we might like, and sort of clunky.  So we do it this way. */
    Q_INVOKABLE QByteArray readFile(QString filename) {
        std::string str = filename.toStdString();
        const char *s = str.c_str();
        int fd = open(s, O_RDONLY);
        if (fd < 0) {
            printf("readFile: %s open() error\n", s);
            return QByteArray();
        }
        off_t len = lseek(fd, 0, SEEK_END);
        lseek(fd, 0, SEEK_SET);
        // printf("readFile: %s has length %d\n", s, len);
        QByteArray arr((qsizetype)len, (char)0);
        ssize_t rv = read(fd, arr.data(), len);
        close(fd);
        if (rv < len) {
            arr.resize(rv);
        }
        return arr;
    }

    Q_INVOKABLE void saveFile(QString filename, const QByteArray &buf) {
        std::string str = filename.toStdString();
        const char *s = str.c_str();
        int fd = open(s, O_WRONLY | O_CREAT | O_TRUNC, 0644);
        if (fd < 0) {
            printf("saveFile: %s open() error\n", s);
            return;
        }
        (void) write(fd, buf.constData(), buf.size());
        close(fd);
    }

    Q_INVOKABLE void atomicSaveFile(QString filename, const QByteArray &buf) {
        QFileInfo fileInfo(filename);
        QString tempFilename = fileInfo.absoluteDir().absoluteFilePath("temp_" + fileInfo.fileName());

        std::string tempFile = tempFilename.toStdString();
        std::string targetFilenameStr = filename.toStdString();

        int fd = open(tempFile.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
        if (fd < 0) {
            printf("atomic rewrite: %s open() error\n", tempFile.c_str());
            return;
        }

        if (write(fd, buf.constData(), buf.size()) != buf.size()) {
            printf("atomic rewrite: Error writing to %s\n", tempFile.c_str());
            close(fd);

            unlink(tempFile.c_str());
            return;
        }

        close(fd);

        if (rename(tempFile.c_str(), targetFilenameStr.c_str()) != 0) {
            printf("atomic rewrite: Error moving %s to %s\n", tempFile.c_str(), targetFilenameStr.c_str());
            unlink(tempFile.c_str());
        }
    }
    /*** Tricks to override the backlight.  See SWIZZLEs of fopen64, fclose, fileno, and write below. ***/
private:
    static const int minBacklightValue = 50;

public:
    int backlightSetting = 255;
    Q_INVOKABLE void updateBacklight(float percentage) {
        // Create our own minimum as below around 50 starts to struggle to drive backlight
        float remainingValue = (UINT8_MAX - minBacklightValue);
        int value = (int)std::round(minBacklightValue + percentage / 100.0f * remainingValue);
        std::string valueText = std::to_string(value);
        int fd;
        backlightSetting = value;
        if ((fd = open("/sys/devices/platform/backlight/backlight/backlight/brightness", O_RDWR)) >= 0) {
            write(fd, valueText.c_str(), valueText.length());
            close(fd);
        }
    }
};
static X1PlusNativeClass native;

/*** DDS interposing into QML ***
 *
 * DDS natively does not have an interface into QML, and in theory, each app
 * really has only one DDS interface.  So we hijack the native DDS interface
 * by overwriting bbl_screen's ddsnode's vtable with one of our own, which
 * modifies the following implementations:
 *
 *  * DdsNode::get_sub_topic_count (and friends) get overwritten to add an
 *    another sub topic that we would like to hear about.
 *
 *  * DdsNode::get_sub_topic_callback gets overwritten to always return our
 *    shim methods, which log to QML and then call back into the original
 *    methods.
 *
 * We also call into the DdsNode's vtable methods from
 * DdsListener.publishJson() so we know where to write to.
 */

typedef struct { char storage[0x18]; } topic_device_json;

/* topic_device_json::json[abi:cxx11]() */
extern "C" void _ZN17topic_device_jsonC1Ev(topic_device_json *self);

/* topic_device_json::~topic_device_json() */
extern "C" void _ZN17topic_device_jsonD2Ev(topic_device_json *self);

/* topic_device_json::json(std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char> > const&) */
extern "C" void _ZN17topic_device_json4jsonERKNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEE(topic_device_json *self, std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char> > const& str);

typedef struct _PublisherHandle PublisherHandle;
/* int wait_for_subscriber(PublisherHandle*, int) */
extern "C" int _Z19wait_for_subscriberP15PublisherHandlei(PublisherHandle *, int timeout);
/* int publish(PublisherHandle *, void *) */
extern "C" int _Z7publishP15PublisherHandlePv(PublisherHandle*, void*);

#define VTABLE_PRE 5
#define DDSNODE_ORIG_VTABLE_SIZE 10
void *ddsnode_orig_vtable[VTABLE_PRE + DDSNODE_ORIG_VTABLE_SIZE];
void *ddsnode_new_vtable[VTABLE_PRE + DDSNODE_ORIG_VTABLE_SIZE];

enum ddsnode_vtable_fns {
    DdsNode_Dtor = 5,
    DdsNode_Delete,
    DdsNode_dds_create_topics,
    DdsNode_get_sub_topic_callback,
    DdsNode_get_sub_topic_count,
    DdsNode_get_pub_topic_count,
    DdsNode_get_sub_topic_type,
    DdsNode_get_pub_topic_type,
    DdsNode_get_sub_topic_name,
    DdsNode_get_pub_topic_name,
};

class DdsListener : public QObject {
    Q_OBJECT

public:
    DdsListener(QObject *parent = 0) : QObject(parent) { }
    ~DdsListener() {}
    
    void *ddsnode = 0;
    
    Q_INVOKABLE void publishJson(QString topicstr, QString string) {
        /* publish_dds_message(ddsnode, topic number, const char *?) */
        /* look up the topic.  this is not terribly performant, but we don't
         * send many DDS messages, so it is ok, I suppose.  */
        int ntopics = ((int(*)(void *))ddsnode_orig_vtable[DdsNode_get_pub_topic_count])(ddsnode);
        int topic;
        for (topic = 0; topic < ntopics; topic++) {
            const char *str = ((const char *(*)(void *, int))ddsnode_orig_vtable[DdsNode_get_pub_topic_name])(ddsnode, topic);
            if (topicstr == str) {
                break;
            }
        }
        if (topic == ntopics) {
            printf("*** failed to lookup topic %s!\n", qPrintable(topicstr));
            return;
        }
         
        topic_device_json *json = new(topic_device_json);
        /* topic_device_json::topic_device_json */ _ZN17topic_device_jsonC1Ev(json);
        std::string str = string.toStdString();
        /* topic_device_json::json */ _ZN17topic_device_json4jsonERKNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEE(json, str);
        PublisherHandle *hnd = *(PublisherHandle **)(*(int *)((int)ddsnode + 0x18) + topic * 4);
        int rv = _Z19wait_for_subscriberP15PublisherHandlei(hnd, 1000);
        if (rv == 0) {
            printf("*** no subscriber available for topic %d\n", topic);
            goto cleanup;
        }
        _Z7publishP15PublisherHandlePv(hnd, json);
    cleanup:
        /* topic_device_json::~topic_device_json */ _ZN17topic_device_jsonD2Ev(json);
        delete json;
    }
    
signals:
    void gotDdsEvent(QString topic, QString datum);
};

static DdsListener listener;
typedef void (*rxfcn_t)(std::string &, void *, void *);

rxfcn_t DdsNode_orig_get_sub_topic_callback(void *p, int i) {
    return ((rxfcn_t(*)(void *, int))ddsnode_orig_vtable[DdsNode_get_sub_topic_callback])(p, i);
}

const char *DdsNode_orig_get_sub_topic_name(void *p, int i) {
    return ((const char *(*)(void *, int))ddsnode_orig_vtable[DdsNode_get_sub_topic_name])(p, i);
}

int DdsNode_orig_get_sub_topic_count(void *p) {
    return ((int(*)(void *))ddsnode_orig_vtable[DdsNode_get_sub_topic_count])(p);
}

/* this is an upper bound; bump this if Bambu have more topics that they subscribe to later */
#define N_SUB_TOPIC_WRAPPERS 20
#define SUB_TOPIC_EXPANDO \
    _(0) _(1) _(2) _(3) _(4) _(5) _(6) _(7) _(8) _(9) _(10) _(11) _(12) _(13) _(14) _(15) _(16) _(17) _(18) _(19)


#define _(n) \
void rx_string_##n(std::string &s, void * s2, void *ctx) { \
    QString datum = QString::fromStdString(s); \
    QString topic = ((const char *(*)(void *, int))ddsnode_new_vtable[DdsNode_get_sub_topic_name])(listener.ddsnode, n); \
    emit listener.gotDdsEvent(topic, datum); \
    if (n < DdsNode_orig_get_sub_topic_count(listener.ddsnode)) { \
        rxfcn_t orig = DdsNode_orig_get_sub_topic_callback(NULL, n); \
        orig(s, s2, ctx); \
    } \
}
SUB_TOPIC_EXPANDO
#undef _

rxfcn_t rx_wrappers[] = {
#define _(n) rx_string_##n,
SUB_TOPIC_EXPANDO
#undef _
};

int DdsNode_new_get_sub_topic_count(void *p) {
    printf("swizzled call for get_sub_topic_count -> %d\n", DdsNode_orig_get_sub_topic_count(p) + 1);
    return DdsNode_orig_get_sub_topic_count(p) + 2;
}

rxfcn_t DdsNode_new_get_sub_topic_callback(void *p, int i) {
    if (i >= N_SUB_TOPIC_WRAPPERS) {
        printf("*** DdsNode_new_get_sub_topic_callback: TOO MANY SUB TOPICS %d!\n", i);
        abort();
    }
    return rx_wrappers[i];

    /* topics:
     *   0: device/report/print
     *   1: device/report/system
     *   2: device/amt/display/request
     *   3: device/inter/report/wifi_set
     *   4: device/report/upgrade
     *   5: device/report/bind
     *   6: device/report/camera
     *   7: device/report/xcam
     *   8: device/report/info
     *   9: device/report/upload
     *  10: device/inter/monitor/request
     *  ... more?
     */
}

const char *DdsNode_new_get_sub_topic_name(void *p, int i) {
    if (i == DdsNode_orig_get_sub_topic_count(p)) {
        return "device/report/mc_print";
    }
    if (i == (DdsNode_orig_get_sub_topic_count(p) + 1)) {
        return "device/x1plus";
    }
    return DdsNode_orig_get_sub_topic_name(p, i);
}


SWIZZLE(void, _ZN7DdsNode8set_nameERNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEE, void *self, void *p)
    printf("interposing DdsNode::set_name\n");
    listener.ddsnode = self;
    void **vptr = (void **)self;
    memcpy(ddsnode_orig_vtable, ((void **)*vptr) - VTABLE_PRE, sizeof(ddsnode_orig_vtable));
    memcpy(ddsnode_new_vtable, ((void **)*vptr) - VTABLE_PRE, sizeof(ddsnode_new_vtable));
    ddsnode_new_vtable[4] = &ddsnode_new_vtable;
    ddsnode_new_vtable[DdsNode_get_sub_topic_callback] = (void *)DdsNode_new_get_sub_topic_callback;
    ddsnode_new_vtable[DdsNode_get_sub_topic_count] = (void *)DdsNode_new_get_sub_topic_count;
    ddsnode_new_vtable[DdsNode_get_sub_topic_name] = (void *)DdsNode_new_get_sub_topic_name;
    *vptr = ddsnode_new_vtable + VTABLE_PRE;
    next(self, p);
}

/*** Tricks to run in emulation, prepending a fake root path to various files that are loaded. ***/

class QFile;
SWIZZLE(void, _ZN5QFileC1ERK7QString, QFile *qf, const QString &fileName)
    QString fn = fileName;
    if (fn.startsWith("/config") && getenv("EMULATION_WORKAROUNDS")) {
        QString rootpath = getenv("EMULATION_WORKAROUNDS");
        fn.prepend("/");
        fn.prepend(rootpath);
    }
    next(qf, fn);
}
SWIZZLE(bool, _ZN5QFile6existsERK7QString, const QString &fileName)
    QString fn = fileName;
    if (fn.startsWith("/config") && getenv("EMULATION_WORKAROUNDS")) {
        QString rootpath = getenv("EMULATION_WORKAROUNDS");
        fn.prepend("/");
        fn.prepend(rootpath);
    }
    return next(fn);
}

SWIZZLE(void, _ZN9QSettingsC1ERK7QStringNS_6FormatEP7QObject, QSettings *q, QString const &name, QSettings::Format f, QObject *o)
    QString fn = name;
    if (fn.startsWith("/config") && getenv("EMULATION_WORKAROUNDS")) {
        QString rootpath = getenv("EMULATION_WORKAROUNDS");
        fn.prepend("/");
        fn.prepend(rootpath);
    }
    next(q, fn, f, o);
}

/*** Tricks to override the backlight.  See X1PlusNative.updateBacklight above. ***/

FILE *backlight_fp = NULL;
int backlight_fd = -1;
SWIZZLE(FILE *, fopen64, const char *p, const char *m)
    char *replacement = NULL;
    if (!strncmp(p, "/config", 7) && getenv("EMULATION_WORKAROUNDS")) {
        asprintf(&replacement, "%s/%s", getenv("EMULATION_WORKAROUNDS"), p);
    }
    FILE *fp = next(replacement ? replacement : p, m);
    if (replacement) {
        free(replacement);
    }

    if (!strcmp(p, "/sys/devices/platform/backlight/backlight/backlight/brightness")) {
        printf("interposed open() to backlight -> fd %p\n", fp);
        backlight_fp = fp;
    }
    return fp;
}

SWIZZLE(int, fclose, FILE *stream)
    if (stream == backlight_fp) {
        printf("interposed fclose() on backlight\n");
        backlight_fp = NULL;
        backlight_fd = -1;
    }
    return next(stream);
}

SWIZZLE(int, fileno, FILE *stream)
    int fd = next(stream);
    if (stream == backlight_fp) {
        printf("interposed fileno() on backlight -> fd %d\n", fd);
        backlight_fd = fd;
    }
    return next(stream);
}

SWIZZLE(ssize_t, write, int fd, const void *p, size_t n)
    if (fd == backlight_fd) {
        printf("interposed write() on backlight, ");
        if (*(char*)p != '0') {
            printf("writing %d instead\n", native.backlightSetting);
            std::string valueText = std::to_string(native.backlightSetting);
            next(fd, valueText.c_str(), valueText.length());
            return n;
        } else {
            printf("backlight off\n");
        }
    }
    return next(fd, p, n);
}

/*** Adding languages (this is freaking hilarious) ***/

static int lang_init = 0;

static void *last_qobject;
SWIZZLE(void *, _ZN7QObjectC1EPS_, void *p1, void *p2)
    last_qobject = p1;
    return next(p1, p2);
}

SWIZZLE(void *, _ZN7QObjectC2EPS_, void *p1, void *p2)
    last_qobject = p1;
    return next(p1, p2);
}

static QMap<QByteArray, QString> *langmap;

SWIZZLE(void *, _Z12bbl_get_propNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEES4_bb, void *a, std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char> > *s1, std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char> > *s2, bool b1, bool b2)
    if (lang_init == 3 && *s1 == "device/model_int") {
        printf("LANG INTERPOSE: found init for DeviceManager\n");
        void **DeviceManager = (void **)last_qobject;
        langmap = (QMap<QByteArray, QString> *) (DeviceManager + 9);
        lang_init++;
    }
    return next(a, s1, s2, b1, b2);
}

SWIZZLE(void *, _ZN10QByteArrayC1EPKci, void *qba, const char *s, int n)
    if (s && strcmp(s, "en") == 0) {
        if (lang_init == 0) {
            printf("LANG INTERPOSE: saw the first pass of en, the last QObject must have been the weird not-a-deviceManager\n");
            void **DeviceManager = (void **)last_qobject;
            langmap = (QMap<QByteArray, QString> *) (DeviceManager + 5);
            lang_init++;
        } else if (lang_init == 1) {
            printf("LANG INTERPOSE: here is the actual langmap init en for round 1\n");
            lang_init++;
            if (*(void **)langmap != &QMapDataBase::shared_null) {
                printf("LANG INTERPOSE: this bbl_screen does NOT look like the memory mapping we expect... not injecting languages into this version of bbl_screen\n");
                lang_init = -1;
            }
        } else if (lang_init == 3) {
            printf("LANG INTERPOSE: saw en for round 1 language default initializer\n");
            lang_init++;
        } else if (lang_init == 4) {
            printf("LANG INTERPOSE: saw en for round 2 map initializer\n");
            lang_init++;
            if (*(void **)langmap != &QMapDataBase::shared_null) {
                printf("LANG INTERPOSE: this bbl_screen does NOT look like the memory mapping we expect... not injecting languages into this version of bbl_screen\n");
                lang_init = -1;
            }
        } else {
            printf("LANG INTERPOSE: saw en fly by again... but after lang init?\n");
        }
    } else if (s && strcmp(s, "sv") == 0) {
        if (lang_init == 2 || lang_init == 5) {
            printf("LANG INTERPOSE: DeviceManager's maps are probably ready, let's do it. langmap = %p, contents are now ", langmap);
            // Add new languages here:
            (*langmap)["ru"] = "Русский";
            qDebug() << *langmap;
            lang_init++;
        } else {
            printf("LANG INTERPOSE: saw sv fly by again... but after lang init?\n");
        }
    }

    return next(qba, s, n);
}

/*** VNC server shenanigans! ***/

#include <xf86drm.h>
#include <QtGui/QRegion>
#include <QtWidgets/QWidget>
#include <QtGui/QWindow>
#include <QtWidgets/QApplication>
#include <QtWidgets/QGraphicsSceneMouseEvent>
#include <rfb/rfb.h>

struct fb_map {
    drm_handle_t handle;
    size_t pitch;
    size_t size;
    uint32_t w;
    uint32_t h;
    uint32_t buf_id;
    void *p;
};

#define FB_MAPS_MAX 4
static struct fb_map fb_maps[FB_MAPS_MAX] = {};

static QRegion lastRegion;
static rfbScreenInfoPtr rfbScreen = NULL;

static void fb_transpose(uint32_t __restrict *fbout, uint32_t __restrict *fbin) {
    struct timeval tv_start;
    gettimeofday(&tv_start, 0);
    const int W = 1280;
    const int H = 720;
    uint8_t dirtyx[W] = {};
    uint8_t dirtyy[H] = {};
    for (int y0 = 0; y0 < H; y0 += 8) {
        for (int x0 = 0; x0 < W; x0 += 8) {
            for (int y = 0; y < 8; y++) {
                for (int x = 0; x < 8; x++) {
                    uint32_t pxl = fbin[(x0 + x) * H + y0 + y];
                    pxl = ((pxl & 0xFF0000) >> 16) | (pxl & 0x00FF00) | ((pxl & 0xFF) << 16);
#if 0
                    if (fbout[(y0+y)*W + W - (x0 + x + 1)] != pxl) {
                        dirtyx[W - (x0 + x + 1)] = 1;
                        dirtyy[y0 + y] = 1;
                    }
#endif
                    fbout[(y0+y)*W + W - (x0 + x + 1)] = pxl;
                }
            }
        }
    }
#if 0
    int sx = -1, sy = -1, dx = 0, dy = 0;
    for (int y = 0; y < H; y++) {
        if (dirtyy[y]) {
            if (sy == -1)
                sy = y;
            dy = y - sy + 1;
        }
    }
    for (int x = 0; x < W; x++) {
        if (dirtyx[x]) {
            if (sx == -1)
                sx = x;
            dx = x - sx + 1;
        }
    }
#else
    QRect bbox = lastRegion.boundingRect();
    int sx = bbox.x(), sy = bbox.y(), dx = bbox.width(), dy = bbox.height();
#endif
    struct timeval tv_end;
    gettimeofday(&tv_end, 0);
    long usec = (tv_end.tv_sec - tv_start.tv_sec) * 1000000 + tv_end.tv_usec - tv_start.tv_usec;
    printf("(%d,%d) + (%d,%d) in %ld us\n", sx, sy, dx, dy, usec);
    rfbMarkRectAsModified(rfbScreen, sx, sy, sx+dx, sy+dy);
}

#define _SYS_IOCTL_H 1 // I need to swizzle this later, leave me alone
#include <linux/input.h>

static void vnc_ptr_event(int button_mask, int x, int y, struct _rfbClientRec *cl) {
    static int last_button_mask = 0;
    
    if (button_mask || last_button_mask) {
        int fd = open("/dev/input/event1", O_RDWR);
        struct input_event ev;
        struct timeval tv;
        
        gettimeofday(&tv, 0);
        ev.input_event_sec = tv.tv_sec;
        ev.input_event_usec = tv.tv_usec;
        
        ev.type = EV_ABS;
        ev.code = ABS_MT_TRACKING_ID;
        ev.value = button_mask ? 31337 : -1;
        write(fd, &ev, sizeof(ev));
        
        ev.code = ABS_MT_POSITION_X;
        ev.value = y;
        write(fd, &ev, sizeof(ev));
        
        ev.code = ABS_MT_POSITION_Y;
        ev.value = 1279 - x;
        write(fd, &ev, sizeof(ev));
        
        ev.type = EV_SYN;
        ev.code = 0;
        ev.value = 0;
        write(fd, &ev, sizeof(ev));
        
        close(fd);
#if 0
        QGraphicsSceneMouseEvent event(button_mask ? QEvent::GraphicsSceneMousePress : QEvent::GraphicsSceneMouseRelease);
        event.setScenePos(QPointF(x, y));
        event.setButton(Qt::LeftButton);
        event.setButtons(Qt::LeftButton);
        printf("CLiCKY: %d %d\n", x, y);
        printf("TOPLEVELAT: %p\n", QApplication::widgetAt(QPoint(x, y)));
        //qDebug() << QApplication::topLevelWindows()[0];
        QApplication::sendEvent(QApplication::topLevelWindows()[0], &event);
#endif
    }
    last_button_mask = button_mask;
}

static void vnc_do_flip(void *fb) {
    if (!rfbScreen) {
        rfbScreen = rfbGetScreen(0, NULL, 1280, 720, 8, 3, 4);
        rfbScreen->frameBuffer = (char *)malloc(1280 * 720 * 4);
        rfbScreen->desktopName = "X1Plus";
        rfbScreen->alwaysShared = TRUE;
        rfbScreen->ptrAddEvent = vnc_ptr_event;
        rfbInitServer(rfbScreen); 
        rfbRunEventLoop(rfbScreen, 1000000, TRUE);
    }
    printf("flipping: rfbScreen clientHead %p\n", rfbScreen->clientHead);
    fb_transpose((uint32_t *)rfbScreen->frameBuffer, (uint32_t *)fb);
}

SWIZZLE(int, drmIoctl, int fd, unsigned long request, void *arg)
    if (request == DRM_IOCTL_MODE_CREATE_DUMB) {
        int rv = next(fd, request, arg);
        if (rv < 0)
            return rv;

        drm_mode_create_dumb *creq = (drm_mode_create_dumb *)arg;
        for (int i = 0; i < FB_MAPS_MAX; i++) {
            if (fb_maps[i].handle)
                continue;
            fb_maps[i].handle = creq->handle;
            fb_maps[i].pitch = creq->pitch;
            fb_maps[i].size = creq->size;
            fb_maps[i].w = creq->width;
            fb_maps[i].h = creq->height;
            printf("drmIoctl mapped handle %p has pitch %d, size %d, w %d, h %d\n", fb_maps[i].handle, (int)creq->pitch, (int)creq->size, (int)creq->width, (int)creq->height);
            break;
        }
        
        return rv;
    } else if (request == DRM_IOCTL_MODE_MAP_DUMB) {
        int rv = next(fd, request, arg);
        if (rv < 0)
            return rv;
        
        drm_mode_map_dumb *mreq = (drm_mode_map_dumb *)arg;
        for (int i = 0; i < FB_MAPS_MAX; i++) {
            if (fb_maps[i].handle != mreq->handle)
                continue;
            fb_maps[i].p = mmap(0, fb_maps[i].size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, mreq->offset);
            printf("drmIoctl mapped handle %p / buf_id %p -> %p\n", fb_maps[i].handle, fb_maps[i].buf_id, fb_maps[i].p);
        }
        return rv;
    } else if (request == DRM_IOCTL_MODE_DESTROY_DUMB) {
        drm_mode_destroy_dumb *dreq = (drm_mode_destroy_dumb *)arg;
        for (int i =0; i < FB_MAPS_MAX; i++) {
            if (fb_maps[i].handle != dreq->handle)
                continue;
            if (fb_maps[i].p) {
                munmap(fb_maps[i].p, fb_maps[i].size);
            }
            fb_maps[i] = {};
        }
        return next(fd, request, arg);
    } else {
        return next(fd, request, arg);
    }
}

SWIZZLE(int, drmModeAddFB2, int fd, uint32_t width, uint32_t height, uint32_t pixel_format, const uint32_t bo_handles[4], const uint32_t pitches[4], const uint32_t offsets[4], uint32_t *buf_id, uint32_t flags)
    int rv = next(fd, width, height, pixel_format, bo_handles, pitches, offsets, buf_id, flags);
    if (rv < 0)
        return rv;

    for (int i = 0; i < FB_MAPS_MAX; i++) {
        if (fb_maps[i].handle != bo_handles[0])
            continue;
        fb_maps[i].buf_id = *buf_id;
        printf("drmModeAddFB2 mapped handle %p to buf %p\n", bo_handles[0], *buf_id);
        break;
    }

    return rv;
}

SWIZZLE(int, drmModePageFlip, int fd, uint32_t crtc_id, uint32_t fb_id, uint32_t flags, void *user_data)
    for (int i = 0; i < FB_MAPS_MAX; i++) {
        if (fb_maps[i].buf_id == fb_id) {
            printf("drmModePageFlip flipped page to buf %p\n", fb_maps[i].p);
            vnc_do_flip(fb_maps[i].p);
        }
    }
    return next(fd, crtc_id, fb_id, flags, user_data);
}

// At some point, this might be interesting for trying to do minimal diffs
// of VNC data to feed to libvncserver but for now here we are.

SWIZZLE(QRegion::const_iterator, _ZNK7QRegion5beginEv, void *_this)
    QRegion::const_iterator r = next(_this);
    void *lr = __builtin_return_address(0);
    Dl_info info = {};
    int rv = dladdr(lr, &info);
    if (info.dli_fname && strstr(info.dli_fname, "qlinuxfb")) {
        printf("QRegion::begin(%p), lr = %p (%s, %s)\n", _this, lr, info.dli_fname, info.dli_sname);
        qDebug() << *(QRegion *)_this;
        lastRegion = *(QRegion *)_this;
    }
    return r;
}

/*** Qt init and resource replacement ***/

extern const unsigned char qt_resource_name[];

SWIZZLE(void, _Z21qRegisterResourceDataiPKhS0_S0_, int version, unsigned char const* tree, unsigned char const* name, unsigned char const* data)
    QString qname;
    qname.resize(qFromBigEndian<qint16>(name));
    qFromBigEndian<ushort>(name + 6, qname.size(), qname.data());
    const char *sname = qname.toLatin1().data();
    
    printf("qRegisterResourceData version %d, %p %p %p (%s)\n", version, tree, name, data, sname);

    if (strcmp("printerui", sname) == 0 && name != qt_resource_name)
    {
        printf("...skipped...\n");
        return;
    }

    next(version, tree, name, data);
} 

SWIZZLE(int, getifaddrs, void *p)
    if (needs_emulation_workarounds)
        return -1;
    return next(p);
}

SWIZZLE(int, ioctl, int fd, unsigned long int req, void *p)
    if (req == SIOCGIWMODE) {
        struct iwreq *wrq = (struct iwreq *)p;
        wrq->u.mode = IW_MODE_INFRA;
        return 0;
    } else if (req == SIOCGIWSTATS) {
        struct iwreq *wrq = (struct iwreq *)p;
        struct iw_statistics *stats = (struct iw_statistics *) wrq->u.data.pointer;
        
        /* this is astonishingly cheesy, but life is too long to write
         * netlink code, and anyway, it's not like they didn't do it first,
         * so */
        FILE *iwfp = ::popen("wpa_cli -i wlan0 signal_poll | grep RSSI | cut -d= -f2", "r");
        if (!iwfp)
            return -1;
        char buf[128];
        if (fgets(buf, sizeof(buf), iwfp) == NULL) {
            pclose(iwfp);
            return -1;
        }
        pclose(iwfp);
        int rssi = atoi(buf);
        if (rssi == 0)
            rssi = -199;
        stats->qual.level = 0x100 + rssi;
        stats->qual.updated = 10;
        printf("ioctl SIOCGIWSTATS: return rssi %d\n", rssi);
        return 0;
    }
    return next(fd, req, p);
}

#include "interpose.moc.h"

extern "C" void __attribute__ ((constructor)) init() {
    unsetenv("LD_PRELOAD");
    if (getenv("EMULATION_WORKAROUNDS"))
        needs_emulation_workarounds = 1;
    setenv("QML_XHR_ALLOW_FILE_READ", "1", 1); // Tell QML that it's ok to let us read files from inside XHR land.
    setenv("QML_XHR_ALLOW_FILE_WRITE", "1", 1); // Tell QML that it's ok to let us write files from inside XHR land.
    qmlRegisterSingletonType("X1PlusNative", 1, 0, "X1PlusNative", [](QQmlEngine *engine, QJSEngine *scriptEngine) -> QJSValue {
        Q_UNUSED(engine)

        QJSValue obj = scriptEngine->newQObject(&native);
        scriptEngine->globalObject().setProperty("_X1PlusNative", obj);
        return obj;
    });
    qmlRegisterSingletonType("DdsListener", 1, 0, "DdsListener", [](QQmlEngine *engine, QJSEngine *scriptEngine) -> QJSValue {
        Q_UNUSED(engine)

        QJSValue obj = scriptEngine->newQObject(&listener);
        
        scriptEngine->globalObject().setProperty("_DdsListener", obj);
        
        return obj;
    });
}
