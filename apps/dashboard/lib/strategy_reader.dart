import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import 'dart:convert';

import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import 'strategy_catalog.dart';
import 'strategy_video.dart';

class StrategyReader {
  StrategyReader(this.catalog, this.brand, this.product);
  final StrategyCatalog catalog;
  final String brand, product;
  Future<void> share(
    BuildContext context,
    String path, {
    bool document = false,
  }) async {
    try {
      final asset = object(catalog.assets[path]);
      final bytes = document
          ? Uint8List.fromList(utf8.encode(catalog.body(path)))
          : (await rootBundle.load(text(asset['file']))).buffer.asUint8List();
      if (!context.mounted) return;
      final box = context.findRenderObject() as RenderBox?;
      await SharePlus.instance.share(
        ShareParams(
          files: [
            XFile.fromData(
              bytes,
              mimeType: document ? 'text/markdown' : text(asset['mime']),
            ),
          ],
          fileNameOverrides: [path.split('/').last],
          sharePositionOrigin: box == null
              ? null
              : box.localToGlobal(Offset.zero) & box.size,
        ),
      );
    } catch (_) {
      if (context.mounted) notify(context, '파일을 내보내지 못했습니다. 다시 시도해주세요.');
    }
  }

  void openDocument(BuildContext context, String path, {String heading = ''}) {
    final doc = object(catalog.documents[path]);
    final scope = object(object(catalog.data['documentScopes'])[path]);
    final scopedReader = StrategyReader(
      catalog,
      text(scope['brandId']).isEmpty ? brand : text(scope['brandId']),
      text(scope['productId']).isEmpty ? product : text(scope['productId']),
    );
    final section = heading.isEmpty ? '' : catalog.section(path, heading);
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => Scaffold(
          appBar: AppBar(
            title: Text(
              text(doc['title']).isEmpty
                  ? path.split('/').last
                  : text(doc['title']),
            ),
            actions: [
              IconButton(
                tooltip: '원문 내보내기',
                onPressed: () => share(context, path, document: true),
                icon: const Icon(Icons.ios_share),
              ),
            ],
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: scopedReader.markdown(
              context,
              section.isEmpty ? catalog.body(path) : section,
              path,
            ),
          ),
        ),
      ),
    );
  }

  Future<void> link(BuildContext context, String href, String base) async {
    final uri = Uri.tryParse(href);
    if (uri == null) return;
    if (['https', 'http', 'mailto'].contains(uri.scheme)) {
      try {
        if (!await launchUrl(uri, mode: LaunchMode.externalApplication) &&
            context.mounted) {
          notify(context, '링크를 열 수 없습니다.');
        }
      } catch (_) {
        if (context.mounted) notify(context, '링크를 열 수 없습니다.');
      }
      return;
    }
    if (uri.hasScheme) return;
    final doc = href.startsWith('#')
        ? base
        : catalog.resolve(href, base: base, brand: brand, product: product);
    if (doc != null && catalog.documents.containsKey(doc)) {
      openDocument(
        context,
        doc,
        heading: uri.fragment.isEmpty
            ? ''
            : RegExp.escape(
                Uri.decodeComponent(uri.fragment).replaceAll('-', ' '),
              ),
      );
      return;
    }
    final asset = catalog.resolve(
      href,
      base: base,
      brand: brand,
      product: product,
      asset: true,
    );
    if (asset != null) {
      openAsset(context, asset);
      return;
    }
    notify(context, '앱에 포함되지 않은 자료입니다.');
  }

  Widget markdown(BuildContext context, String body, String path) =>
      body.isEmpty
      ? const Padding(
          padding: EdgeInsets.all(16),
          child: Text('이 항목의 자료가 없습니다.'),
        )
      : MarkdownBody(
          data: body,
          selectable: true,
          onTapLink: (_, href, _) {
            if (href != null) link(context, href, path);
          },
          imageBuilder: (uri, title, alt) {
            final asset = catalog.resolve(
              uri.toString(),
              base: path,
              brand: brand,
              product: product,
              asset: true,
            );
            return asset == null
                ? Text(alt ?? '이미지 자료 없음')
                : image(context, asset, height: 180);
          },
          styleSheet: MarkdownStyleSheet(
            p: const TextStyle(
              fontSize: 14,
              height: 1.75,
              color: Color(0xff344054),
            ),
            tableColumnWidth: const IntrinsicColumnWidth(),
            tableCellsPadding: const EdgeInsets.all(10),
          ),
        );

  Widget image(
    BuildContext context,
    String path, {
    double height = 200,
    bool tap = true,
  }) {
    final asset = object(catalog.assets[path]);
    final file = text(asset['file']);
    if (file.isEmpty) {
      return SizedBox(
        height: height,
        child: const Center(child: Text('이미지 자료가 없습니다.')),
      );
    }
    final Widget content = file.endsWith('.svg')
        ? SvgPicture.asset(
            file,
            height: height,
            fit: BoxFit.contain,
            semanticsLabel: path.split('/').last,
          )
        : Image.asset(
            file,
            height: height,
            fit: BoxFit.contain,
            errorBuilder: (_, _, _) =>
                const Center(child: Text('미리보기를 지원하지 않는 파일입니다.')),
          );
    return GestureDetector(
      onTap: tap ? () => openAsset(context, path) : null,
      child: SizedBox(width: double.infinity, height: height, child: content),
    );
  }

  void openAsset(BuildContext context, String path) {
    final mime = text(object(catalog.assets[path])['mime']);
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => Scaffold(
          appBar: AppBar(
            title: Text(path.split('/').last),
            actions: [
              IconButton(
                tooltip: '파일 내보내기',
                onPressed: () => share(context, path),
                icon: const Icon(Icons.ios_share),
              ),
            ],
          ),
          body: Center(
            child: mime.startsWith('image/')
                ? InteractiveViewer(
                    minScale: .5,
                    maxScale: 5,
                    child: image(
                      context,
                      path,
                      height: MediaQuery.sizeOf(context).height * .7,
                      tap: false,
                    ),
                  )
                : mime.startsWith('video/')
                ? StrategyVideo(
                    asset: text(object(catalog.assets[path])['file']),
                  )
                : const Text('상단 내보내기로 파일을 저장하거나 열 수 있습니다.'),
          ),
        ),
      ),
    );
  }

  static void notify(BuildContext context, String message) =>
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
}
